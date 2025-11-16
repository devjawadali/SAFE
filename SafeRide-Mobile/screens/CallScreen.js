import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
//import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } from 'react-native-webrtc';
import { getSocket, getAuthToken, connectSocket } from '../services/network';

export default function CallScreen({ route, navigation }) {
  const { tripId, driverId, driverName } = route.params || {};
  const [callStatus, setCallStatus] = useState('idle');
  const [callId, setCallId] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const durationInterval = useRef(null);
  const callInitiatedByMe = useRef(false);
    const callIdRef = useRef(null); // Fix for ICE candidate closure issue        
  const initiateTimeoutRef = useRef(null); // Fix for Comment 1: Timeout management
  const callStatusRef = useRef('idle'); // Fix for Comment 1: Track status to avoid stale closures

  // WebRTC Configuration
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Update callIdRef whenever callId changes
  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  // Update callStatusRef whenever callStatus changes
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

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

  // Fix for Comment 4: Ensure socket connection
  const ensureSocketConnection = async () => {
    let socket = getSocket();
    if (!socket) {
      const token = await getAuthToken();
      if (token) {
        socket = await connectSocket(token);
        console.log('Socket connected in CallScreen');
      } else {
        console.warn('No auth token available for socket connection');
        Alert.alert('Error', 'Authentication required. Please login again.');   
        return null;
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

  useEffect(() => {
    const initialize = async () => {
      await loadUserData();
      await initializeAudio();
      await ensureSocketConnection();
      const teardown = setupSocketListeners();
      return teardown;
    };

    let teardownFn = null;
    initialize().then(teardown => {
      teardownFn = teardown;
    });

    return () => {
      // Fix for Comment 1: Clear timeout on unmount
      if (initiateTimeoutRef.current) {
        clearTimeout(initiateTimeoutRef.current);
        initiateTimeoutRef.current = null;
      }
      // Fix: Call teardown before cleanup if it exists
      if (teardownFn) {
        teardownFn();
      }
      cleanup();
    };
  }, [tripId, driverId]);

  const initializeAudio = async () => {
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });                                                                            
      localStream.current = stream;
      return stream;
    } catch (error) {
      console.error('Error getting microphone permission:', error);
      Alert.alert(
        'Microphone Permission Required',
        'Please allow microphone access to make calls',
        [
          { text: 'Cancel', onPress: () => navigation.goBack() },
          { text: 'OK' }
        ]
      );
      throw error;
    }
  };

  const setupSocketListeners = () => {
    const socket = getSocket();
    if (!socket || !tripId) return null;

    let incomingCallId = null;

    const handleCallIncoming = (data) => {
      const { call_id, caller_id } = data;
      if (caller_id !== currentUserId && !callInitiatedByMe.current) {
        // Fix for Comment 1: Clear timeout immediately upon receiving call_incoming
        if (initiateTimeoutRef.current) {
          clearTimeout(initiateTimeoutRef.current);
          initiateTimeoutRef.current = null;
        }
        incomingCallId = call_id;
        setCallId(call_id);
        callIdRef.current = call_id; // Update ref immediately
        setCallStatus('ringing');
        callStatusRef.current = 'ringing'; // Update status ref
        setIsIncomingCall(true);
      }
    };

    const handleCallOffer = async (data) => {
      try {
        const { call_id, from_user_id, sdp } = data;
        
        // Fix for Comment 2: Set callId before setting remote description
        setCallId(call_id);
        callIdRef.current = call_id; // Update ref immediately so onicecandidate can use it

        if (!peerConnection.current) {
          createPeerConnection();
        }

        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(sdp)
        );

        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        if (socket) {
          socket.emit('call_answer', { callId: call_id, sdp: answer });
        }

        setCallStatus('connected');
        callStatusRef.current = 'connected'; // Update status ref
        startCallTimer();
      } catch (error) {
        console.error('Error handling call offer:', error);
        Alert.alert('Error', 'Failed to handle call offer');
      }
    };

        const handleCallAnswer = async (data) => {
      try {
        const { call_id, from_user_id, sdp } = data;

        if (peerConnection.current) {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(sdp)
          );
          setCallStatus('connected');
          callStatusRef.current = 'connected'; // Update status ref
          startCallTimer();
        }
      } catch (error) {
        console.error('Error handling call answer:', error);
        Alert.alert('Error', 'Failed to handle call answer');
      }
    };

    const handleIceCandidate = async (data) => {
      try {
        const { call_id, from_user_id, candidate } = data;
        
        if (peerConnection.current && candidate) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };

    const handleCallEnded = (data) => {
      const { call_id, ended_at, duration, reason } = data;
      // Fix for Comment 1: Clear timeout on call ended
      if (initiateTimeoutRef.current) {
        clearTimeout(initiateTimeoutRef.current);
        initiateTimeoutRef.current = null;
      }
      setCallStatus('ended');
      callStatusRef.current = 'ended'; // Update status ref
      stopCallTimer();
      cleanupWebRTC();
      
      setTimeout(() => {
        navigation.goBack();
      }, 2000);
    };

    const handleCallConnected = () => {
      // Fix for Comment 1: Clear timeout when call connects
      if (initiateTimeoutRef.current) {
        clearTimeout(initiateTimeoutRef.current);
        initiateTimeoutRef.current = null;
      }
      setCallStatus('connected');
      callStatusRef.current = 'connected'; // Update status ref
      startCallTimer();
    };

    const handleCallError = (data) => {
      // Fix for Comment 1: Clear timeout on error
      if (initiateTimeoutRef.current) {
        clearTimeout(initiateTimeoutRef.current);
        initiateTimeoutRef.current = null;
      }
      Alert.alert('Call Error', data.error || 'An error occurred during the call');
      setError(data.error);
      setCallStatus('ended');
      callStatusRef.current = 'ended'; // Update status ref
      cleanupWebRTC();
    };

    socket.on('call_incoming', handleCallIncoming);
    socket.on('call_offer', handleCallOffer);
    socket.on('call_answer', handleCallAnswer);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_connected', handleCallConnected);
    socket.on('call_error', handleCallError);

    // Return cleanup function
    return () => {
      if (socket) {
        socket.off('call_incoming', handleCallIncoming);
        socket.off('call_offer', handleCallOffer);
        socket.off('call_answer', handleCallAnswer);
        socket.off('ice_candidate', handleIceCandidate);
        socket.off('call_ended', handleCallEnded);
        socket.off('call_connected', handleCallConnected);
        socket.off('call_error', handleCallError);
      }
    };
  };

  const createPeerConnection = () => {
    try {
      const pc = new RTCPeerConnection({ iceServers });

      // Add local stream tracks
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
          pc.addTrack(track, localStream.current);
        });
      }

      // Handle ICE candidates - Fix: Use callIdRef.current instead of callId
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          const currentCallId = callIdRef.current;
          if (socket && currentCallId) {
            socket.emit('ice_candidate', {
              callId: currentCallId,
              candidate: event.candidate
            });
          }
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        remoteStream.current = event.streams[0];
      };

      peerConnection.current = pc;
      return pc;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      Alert.alert('Error', 'Failed to create peer connection');
      return null;
    }
  };

    const initiateCall = async () => {
    // Fix for Comment 4: Ensure socket connection
    let socket = await ensureSocketConnection();
    if (!socket || !tripId) {
      Alert.alert('Error', 'Socket not connected');
      return;
    }

    // Fix for Comment 3: Ensure audio stream is ready
    if (!localStream.current) {
      try {
        await initializeAudio();
      } catch (error) {
        Alert.alert('Error', 'Microphone access required to make calls');
        return;
      }
    }

    // Join trip room for proper routing (normalize tripId to string)
    socket.emit('join_trip', String(tripId));

    callInitiatedByMe.current = true;
    setIsIncomingCall(false);
    setCallStatus('initiating');
    callStatusRef.current = 'initiating'; // Update status ref

    // Fix for Comment 1: Clear any existing timeout
    if (initiateTimeoutRef.current) {
      clearTimeout(initiateTimeoutRef.current);
      initiateTimeoutRef.current = null;
    }

    try {
      // Create peer connection first
      const pc = createPeerConnection();
      if (!pc) {
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        callInitiatedByMe.current = false;
        return;
      }

      // Emit call initiate
      socket.emit('call_initiate', { tripId, emergencyRecording: false });      

      // Listen for call_incoming to get the actual call_id
      const handleCallInitiated = (data) => {
        const { call_id, caller_id } = data;
        // Only handle if this call was initiated by us
        if (call_id && caller_id === currentUserId && callInitiatedByMe.current) {                                                                              
          // Fix for Comment 1: Clear timeout immediately upon receiving call_incoming
          if (initiateTimeoutRef.current) {
            clearTimeout(initiateTimeoutRef.current);
            initiateTimeoutRef.current = null;
          }
          
          setCallId(call_id);
          callIdRef.current = call_id; // Update ref immediately

          // Create offer with the actual call_id
          pc.createOffer().then(async (offer) => {
            await pc.setLocalDescription(offer);

            if (socket) {
              socket.emit('call_offer', {
                callId: call_id,
                sdp: offer
              });
            }

            setCallStatus('ringing');
            callStatusRef.current = 'ringing'; // Update status ref
          }).catch((error) => {
            console.error('Error creating offer:', error);
            Alert.alert('Error', 'Failed to create call offer');
            setCallStatus('idle');
            callStatusRef.current = 'idle';
            callInitiatedByMe.current = false;
          });

          socket.off('call_incoming', handleCallInitiated);
        }
      };

      socket.on('call_incoming', handleCallInitiated);

      // Fix for Comment 1: Store timeout id in ref, use callStatusRef.current or check peerConnection/callId for stale state
      initiateTimeoutRef.current = setTimeout(() => {
        // Fix: Guard with presence of peerConnection/callId to avoid stale closure issues
        if (!peerConnection.current || !callIdRef.current) {
          socket.off('call_incoming', handleCallInitiated);
          // Only trigger timeout if still in initiating state (checked via ref)
          if (callStatusRef.current === 'initiating') {
            Alert.alert('Error', 'Call initiation timeout');
            setCallStatus('idle');
            callStatusRef.current = 'idle';
            callInitiatedByMe.current = false;
            cleanupWebRTC();
          }
          initiateTimeoutRef.current = null;
        }
      }, 10000);
    } catch (error) {
      console.error('Error initiating call:', error);
      Alert.alert('Error', 'Failed to initiate call');
      setCallStatus('idle');
      callStatusRef.current = 'idle';
      callInitiatedByMe.current = false;
      cleanupWebRTC();
      // Fix for Comment 1: Clear timeout on error
      if (initiateTimeoutRef.current) {
        clearTimeout(initiateTimeoutRef.current);
        initiateTimeoutRef.current = null;
      }
    }
  };

    const answerCall = async () => {
    try {
      // Fix for Comment 3: Ensure audio stream is ready
      if (!localStream.current) {
        try {
          await initializeAudio();
        } catch (error) {
          Alert.alert('Error', 'Microphone access required to answer calls');
          return;
        }
      }

      const pc = createPeerConnection();
      if (!pc) return;

      // Wait for call_offer event which will be handled by socket listener     
      setCallStatus('connecting');
      callStatusRef.current = 'connecting'; // Update status ref
    } catch (error) {
      console.error('Error answering call:', error);
      Alert.alert('Error', 'Failed to answer call');
    }
  };

    const endCall = () => {
    // Fix for Comment 1: Clear timeout on call end
    if (initiateTimeoutRef.current) {
      clearTimeout(initiateTimeoutRef.current);
      initiateTimeoutRef.current = null;
    }

    const socket = getSocket();
    if (socket && callId) {
      socket.emit('call_end', { callId, reason: 'user_ended' });
    }

    cleanupWebRTC();
    stopCallTimer();
    setCallStatus('ended');
    callStatusRef.current = 'ended'; // Update status ref
    callInitiatedByMe.current = false;
    setIsIncomingCall(false);

    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  };

  const rejectCall = () => {
    // Fix for Comment 1: Clear timeout on reject
    if (initiateTimeoutRef.current) {
      clearTimeout(initiateTimeoutRef.current);
      initiateTimeoutRef.current = null;
    }

    const socket = getSocket();
    if (socket && callId) {
      socket.emit('call_end', { callId, reason: 'rejected' });
    }
    callInitiatedByMe.current = false;
    setIsIncomingCall(false);
    setCallStatus('idle');
    callStatusRef.current = 'idle'; // Update status ref
    navigation.goBack();
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleSpeaker = () => {
    // Basic implementation - react-native-webrtc handles audio routing
    setIsSpeakerOn(!isSpeakerOn);
  };

  const startCallTimer = () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
    }
    setCallDuration(0);
    durationInterval.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  };

  const cleanupWebRTC = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    remoteStream.current = null;
  };

  const cleanup = () => {
    // Fix for Comment 1: Clear timeout in cleanup
    if (initiateTimeoutRef.current) {
      clearTimeout(initiateTimeoutRef.current);
      initiateTimeoutRef.current = null;
    }

    cleanupWebRTC();
    stopCallTimer();
    callInitiatedByMe.current = false;
    setIsIncomingCall(false);
    
    const socket = getSocket();
    if (socket && callId) {
      socket.emit('call_end', { callId, reason: 'user_left' });
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderCallUI = () => {
    switch (callStatus) {
      case 'idle':
        return (
          <View style={styles.callContainer}>
            <View style={styles.callHeader}>
              <Text style={styles.callerName}>{driverName || 'Driver'}</Text>
              <Text style={styles.callStatus}>Tap to start voice call</Text>
            </View>
            <View style={styles.callControls}>
              <TouchableOpacity
                style={[styles.callButton, styles.endCallButton]}
                onPress={initiateCall}
              >
                <Text style={styles.callButtonIcon}>📞</Text>
                <Text style={styles.callButtonLabel}>Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'initiating':
      case 'ringing':
        return (
          <View style={styles.callContainer}>
            <View style={styles.callHeader}>
              <View style={styles.ringingAnimation}>
                <Text style={styles.callAvatarText}>
                  {(driverName || 'D')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.callerName}>{driverName || 'Driver'}</Text>
              <Text style={styles.callStatus}>
                {callStatus === 'initiating' ? 'Calling...' : 'Ringing...'}
              </Text>
            </View>
            <View style={styles.callControls}>
              <TouchableOpacity
                style={[styles.endCallButton]}
                onPress={endCall}
              >
                <Text style={styles.callButtonIcon}>✕</Text>
                <Text style={styles.callButtonLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'connected':
        return (
          <View style={styles.callContainer}>
            <View style={styles.callHeader}>
              <View style={styles.callAvatar}>
                <Text style={styles.callAvatarText}>
                  {(driverName || 'D')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.callerName}>{driverName || 'Driver'}</Text>
              <Text style={[styles.callStatus, styles.callStatusConnected]}>
                Connected
              </Text>
              <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
            </View>
            <View style={styles.callControls}>
              <View style={styles.callButtonsRow}>
                <TouchableOpacity
                  style={[styles.callButton, isMuted && styles.callButtonActive]}
                  onPress={toggleMute}
                >
                  <Text style={styles.callButtonIcon}>
                    {isMuted ? '🔇' : '🎤'}
                  </Text>
                  <Text style={styles.callButtonLabel}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.callButton, isSpeakerOn && styles.callButtonActive]}
                  onPress={toggleSpeaker}
                >
                  <Text style={styles.callButtonIcon}>
                    {isSpeakerOn ? '📱' : '🔊'}
                  </Text>
                  <Text style={styles.callButtonLabel}>Speaker</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.endCallButton}
                onPress={endCall}
              >
                <Text style={styles.callButtonIcon}>✕</Text>
                <Text style={styles.endCallButtonText}>End Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'ended':
        return (
          <View style={styles.callEndedContainer}>
            <Text style={styles.callEndedTitle}>Call Ended</Text>
            <Text style={styles.callEndedDuration}>
              Call duration: {formatDuration(callDuration)}
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return (
          <View style={styles.callContainer}>
            <Text style={styles.pageTitle}>Call {driverName || 'Driver'}</Text>
          </View>
        );
    }
  };

  // Handle incoming call UI
  if (callStatus === 'ringing' && isIncomingCall && callId) {
    return (
      <View style={styles.callContainer}>
        <View style={styles.callHeader}>
          <View style={styles.ringingAnimation}>
            <Text style={styles.callAvatarText}>
              {(driverName || 'D')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.callerName}>{driverName || 'Driver'}</Text>
          <Text style={styles.callStatus}>Incoming Call</Text>
        </View>
        <View style={styles.callControls}>
          <View style={styles.incomingCallButtons}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={answerCall}
            >
              <Text style={styles.callButtonIcon}>📞</Text>
              <Text style={styles.callButtonLabel}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={rejectCall}
            >
              <Text style={styles.callButtonIcon}>✕</Text>
              <Text style={styles.callButtonLabel}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return renderCallUI();
}

const styles = StyleSheet.create({
  callContainer: { flex: 1, backgroundColor: '#1f2937', justifyContent: 'space-between', padding: 40 },
  callHeader: { alignItems: 'center', marginTop: 60 },
  callStatus: { fontSize: 18, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  callStatusConnected: { color: '#10b981' },
  callerName: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  callDuration: { fontSize: 48, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  callAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#ec4899', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  callAvatarText: { fontSize: 48, fontWeight: 'bold', color: '#fff' },
  callControls: { alignItems: 'center' },
  callButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 40 },
  callButton: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#374151' },
  callButtonActive: { backgroundColor: '#ec4899' },
  callButtonIcon: { fontSize: 28 },
  endCallButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  endCallButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  incomingCallButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 40 },
  acceptButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  rejectButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  callButtonLabel: { color: '#fff', fontSize: 14, marginTop: 8, fontWeight: '600' },
  ringingAnimation: { width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(236, 72, 153, 0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  callEndedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1f2937', padding: 40 },
  callEndedTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  callEndedDuration: { fontSize: 18, color: '#9ca3af', marginBottom: 40 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  button: { backgroundColor: '#ec4899', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

