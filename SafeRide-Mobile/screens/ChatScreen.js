import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getSocket, getAuthToken, connectSocket } from '../services/network';

export default function ChatScreen({ route, navigation }) {
  const { tripId, driverId, driverName } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const flatListRef = useRef(null);
  const typingTimeout = useRef(null);
  const teardownRef = useRef(null);

    useEffect(() => {
    const initializeChat = async () => {
      await loadUserData();
      await ensureSocketConnection();
      await loadMessages();
      teardownRef.current = setupSocketListeners();
    };

    initializeChat();

    return () => {
      // Fix for Comment 5: Pick one cleanup approach - use teardown from setupSocketListeners
      if (teardownRef.current) {
        teardownRef.current();
      }
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
    };
  }, [tripId, driverId, currentUserId]);

  const loadUserData = async () => {
    try {
      const data = await AsyncStorage.getItem('userData');
      if (data) {
        const user = JSON.parse(data);
        setCurrentUserId(user.user_id || user.id);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const ensureSocketConnection = async () => {
    let socket = getSocket();
    if (!socket) {
      const token = await getAuthToken();
      if (token) {
        socket = await connectSocket(token);
        console.log('Socket connected in ChatScreen');
      } else {
        console.warn('No auth token available for socket connection');
        Alert.alert('Error', 'Authentication required. Please login again.');
        return;
      }
    }
    
    // Check if socket is actually connected
    if (socket && !socket.connected) {
      console.log('Socket not connected, waiting for connection...');
      // Wait a bit for connection
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    return socket;
  };

  const loadMessages = async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await api.get('/messages', { params: { tripId } });
      const sortedMessages = (res.data || []).sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const setupSocketListeners = () => {
    const socket = getSocket();
    if (!socket || !tripId) {
      console.warn('Socket or tripId not available for setupSocketListeners');
      return;
    }

    socket.emit('join_trip', String(tripId)); // Normalize tripId to string

    const handleReceiveMessage = (data) => {
      const { message_id, sender_id, recipient_id, message, timestamp, is_flagged, clientId } = data;
      
      // Check if this is a duplicate of an optimistic message
      setMessages(prev => {
        // Remove optimistic message with matching clientId or matching text+timestamp
        const filtered = prev.filter(msg => {
          if (msg.clientId && msg.clientId === clientId) {
            return false; // Remove optimistic message
          }
          // Also check for duplicate text and similar timestamp (within 2 seconds)
          if (msg.message === message && msg.sender_id === sender_id) {
            const msgTime = new Date(msg.timestamp).getTime();
            const newTime = new Date(timestamp).getTime();
            if (Math.abs(msgTime - newTime) < 2000) {
              return false; // Remove duplicate
            }
          }
          return true;
        });
        
        // Add the server message
        const newMessage = {
          message_id,
          sender_id,
          recipient_id,
          message,
          timestamp,
          read_at: null,
          is_flagged
        };
        return [...filtered, newMessage];
      });
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);

      // Mark as read if message is from other user
      setTimeout(() => {
        if (currentUserId && sender_id !== currentUserId && socket) {
          socket.emit('message_read', { messageId: message_id });
        }
      }, 500);
    };

    const handleUserTyping = (data) => {
      const { user_id, is_typing } = data;
      if (user_id === driverId) {
        setOtherUserTyping(is_typing);
      }
    };

    const handleMessageReadReceipt = (data) => {
      const { message_id, read_at } = data;
      setMessages(prev => prev.map(msg => 
        msg.message_id === message_id 
          ? { ...msg, read_at }
          : msg
      ));
    };

    const handleMessageError = (data) => {
      Alert.alert('Error', data.error || 'Message error occurred');
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('user_typing', handleUserTyping); // Backend emits 'user_typing' (we emit 'typing_indicator' to server)
    socket.on('message_read_receipt', handleMessageReadReceipt);
    socket.on('message_error', handleMessageError);

    // Return cleanup function
    return () => {
      if (socket) {
        socket.off('receive_message', handleReceiveMessage);
        socket.off('user_typing', handleUserTyping);
        socket.off('message_read_receipt', handleMessageReadReceipt);
        socket.off('message_error', handleMessageError);
      }
    };
  };

  // Fix for Comment 5: Removed cleanupSocketListeners - using teardown from setupSocketListeners instead

  const sendMessage = async () => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !tripId) return;

    const socket = getSocket();
    if (!socket) {
      Alert.alert('Error', 'Socket not connected. Please try again.');
      await ensureSocketConnection();
      return;
    }

    // Generate client ID for optimistic update tracking
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempMessageId = Date.now().toString();
    const tempMessage = {
      message_id: tempMessageId,
      sender_id: currentUserId,
      recipient_id: driverId,
      message: trimmedMessage,
      timestamp: new Date().toISOString(),
      read_at: null,
      clientId // Include clientId for duplicate detection
    };

    // Optimistic update
    setMessages(prev => [...prev, tempMessage]);
    setMessageText('');
    
    // Stop typing indicator
    socket.emit('typing_indicator', { tripId, isTyping: false });

    try {
      // Include clientId in emit for server to echo back
      socket.emit('send_message', { tripId, message: trimmedMessage, clientId });
      
      // Auto-scroll
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.message_id !== tempMessageId));
      setMessageText(trimmedMessage);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleTextChange = (text) => {
    setMessageText(text);
    
    const socket = getSocket();
    if (!socket || !tripId) return;

    // Clear existing timeout
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    // Emit typing indicator
    if (text.trim().length > 0) {
      socket.emit('typing_indicator', { tripId, isTyping: true });
    } else {
      socket.emit('typing_indicator', { tripId, isTyping: false });
    }

    // Set timeout to stop typing indicator
    typingTimeout.current = setTimeout(() => {
      const socket = getSocket();
      if (socket) {
        socket.emit('typing_indicator', { tripId, isTyping: false });
      }
    }, 2000);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const renderMessage = ({ item }) => {
    const isSent = item.sender_id === currentUserId;
    return (
      <View style={[
        styles.messageBubble,
        isSent ? styles.sentMessage : styles.receivedMessage
      ]}>
        <Text style={[
          styles.messageText,
          isSent ? styles.sentMessageText : styles.receivedMessageText
        ]}>
          {item.message}
        </Text>
        <Text style={styles.messageTimestamp}>
          {formatTime(item.timestamp)}
        </Text>
        {isSent && (
          <Text style={styles.messageReadIndicator}>
            {item.read_at ? '✓✓' : '✓'}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.chatContainer}>
        <View style={styles.chatHeader}>
          <Text style={styles.pageTitle}>Chat with {driverName || 'Driver'}</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.chatContainer}>
      <View style={styles.chatHeader}>
        <Text style={styles.pageTitle}>Chat with {driverName || 'Driver'}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.message_id?.toString() || Math.random().toString()}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }}
      />

      {otherUserTyping && (
        <View style={styles.typingIndicator}>
          <Text>{driverName || 'Driver'} is typing...</Text>
        </View>
      )}

      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatInput}
          placeholder="Type a message..."
          value={messageText}
          onChangeText={handleTextChange}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            messageText.trim().length === 0 && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={messageText.trim().length === 0}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chatContainer: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  messagesList: { flex: 1, padding: 16 },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginBottom: 8 },
  sentMessage: { alignSelf: 'flex-end', backgroundColor: '#ec4899', borderBottomRightRadius: 4 },
  receivedMessage: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  sentMessageText: { color: '#fff' },
  receivedMessageText: { color: '#1f2937' },
  messageTimestamp: { fontSize: 12, marginTop: 4, opacity: 0.7 },
  messageReadIndicator: { fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
  typingIndicator: { padding: 12, fontSize: 14, color: '#6b7280', fontStyle: 'italic' },
  chatInputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'flex-end' },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, backgroundColor: '#f9fafb', maxHeight: 100 },
  sendButton: { backgroundColor: '#ec4899', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendButtonDisabled: { backgroundColor: '#d1d5db', opacity: 0.5 },
  sendButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});

