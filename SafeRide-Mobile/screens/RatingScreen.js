import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/network';
import config from '../config/app.config';

// Helper to extract server host and port from API_URL
const getServerInfo = () => {
  try {
    const url = new URL(config.API_URL);
    return {
      serverHost: url.hostname,
      serverPort: url.port || (url.protocol === 'https:' ? '443' : '80'),
    };
  } catch (error) {
    return {
      serverHost: 'unknown',
      serverPort: 'unknown',
    };
  }
};

// Error handling helper - uses config flag for verbose errors
const buildNetworkErrorMessage = (error, actionLabel) => {
  const showVerbose = config.SHOW_VERBOSE_ERRORS;
  
  if (showVerbose) {
    const { serverHost, serverPort } = getServerInfo();
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return `Connection timeout. Backend server at ${serverHost}:${serverPort} is not responding. Please verify:\n\n1. Backend server is running on port ${serverPort}\n2. Your computer IP is ${serverHost}\n3. Phone and computer are on same WiFi network`;
    } else if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return `Cannot connect to backend server at ${serverHost}:${serverPort}. Please check:\n\n1. Backend server is running (npm start or docker-compose up)\n2. Server is listening on port ${serverPort}\n3. Firewall is not blocking port ${serverPort}\n4. Both devices are on WiFi network ${serverHost.split('.').slice(0, 3).join('.')}.x`;
    } else if (error.code === 'ENOTFOUND') {
      return `Cannot resolve host ${serverHost}. Please verify:\n\n1. Your computer's IP address (run 'ipconfig' on Windows)\n2. Update API_URL in config/app.config.js if IP changed\n3. Restart Expo with 'npx expo start -c'`;
    } else if (error.response) {
      return `Backend error: ${error.response.data?.error || error.response.statusText} (Status: ${error.response.status})`;
    } else {
      return `${actionLabel}: ${error.message}. Backend URL: ${config.API_URL}. Error code: ${error.code || 'UNKNOWN'}`;
    }
  } else {
    // Generic user-friendly messages for production
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Connection timeout. Please check your internet connection and try again.';
    }
    else if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    else if (error.code === 'ENOTFOUND') {
      return 'Unable to reach the server. Please check your internet connection.';
    }
    else if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        return 'Authentication required. Please login again.';
      } else if (status === 403) {
        return 'You do not have permission to perform this action.';
      } else if (status === 404) {
        return 'The requested resource was not found.';
      } else if (status >= 500) {
        return 'Server error. Please try again later.';
      }
      return `Request failed. ${error.response.data?.error || 'Please try again.'}`;
    }
    else {
      return `${actionLabel} failed. Please try again.`;
    }
  }
};

export default function RatingScreen({ route, navigation }) {
  const { tripId, driverName, vehicleInfo } = route.params || {};
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tripData, setTripData] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [userData, setUserData] = useState(null);
  const [rateePhotoUrl, setRateePhotoUrl] = useState(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await loadUserData();
      if (tripId) {
        loadTripDetails();
      } else {
        Alert.alert('Error', 'Trip ID is missing', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    };
    initialize();
  }, [tripId]);

  const loadUserData = async () => {
    const data = await AsyncStorage.getItem('userData');
    if (data) setUserData(JSON.parse(data));
  };

  const loadTripDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/trips/${tripId}`);
      const trip = res.data;
      
      // Validate trip is completed
      if (trip.status !== 'completed') {
        Alert.alert('Error', 'Trip must be completed before rating', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
        return;
      }

      // Determine ratee based on user role
      let currentUserRole = userData?.role;
      if (!currentUserRole) {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const parsedUserData = JSON.parse(userDataStr);
          currentUserRole = parsedUserData.role;
        }
      }
      let rateeName, vehicleInfoText, photoUrl;

      if (currentUserRole === 'passenger') {
        // Passenger rates driver
        rateeName = trip.driver_name || driverName || 'Driver';
        vehicleInfoText = trip.vehicle_make && trip.vehicle_model && trip.vehicle_plate
          ? `${trip.vehicle_make} ${trip.vehicle_model} - ${trip.vehicle_plate}`
          : vehicleInfo || 'Vehicle information not available';
        // Check for driver photo URL (driver_photo_url or driverPhotoUrl)
        photoUrl = trip.driver_photo_url || trip.driverPhotoUrl || null;
      } else {
        // Driver rates passenger
        rateeName = trip.passenger_name || 'Passenger';
        vehicleInfoText = null;
        // Check for passenger photo URL (passenger_photo_url or passengerPhotoUrl)
        photoUrl = trip.passenger_photo_url || trip.passengerPhotoUrl || null;
      }

      setRateePhotoUrl(photoUrl);
      setTripData({
        rateeName,
        vehicleInfo: vehicleInfoText,
        route: {
          pickup: trip.pickup_address,
          dropoff: trip.drop_address
        },
        price: trip.accepted_price || trip.proposed_price || 0
      });
    } catch (error) {
      console.error('Load Trip Details Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to load trip details');
      
      if (error.response?.status === 404) {
        Alert.alert('Error', 'Trip not found', [
          { text: 'OK', onPress: () => navigation.navigate('Main') }
        ]);
      } else if (error.response?.status === 403) {
        Alert.alert('Error', 'You are not authorized to rate this trip', [
          { text: 'OK', onPress: () => navigation.navigate('Main') }
        ]);
      } else {
        Alert.alert('Error', errorMessage, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          style={styles.starButton}
          onPress={() => setRating(i)}
          accessibilityLabel={`Rate ${i} stars`}
          accessibilityHint="Double tap to rate"
        >
          <Text style={[styles.starText, i <= rating ? styles.starFilled : styles.starEmpty]}>
            {i <= rating ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const isDuplicateRatingError = (error) => {
    // Check for status code 409 (Conflict) which is standard for duplicate resource creation
    if (error.response?.status === 409) {
      return true;
    }
    
    // Check for error code field if available
    if (error.response?.data?.code === 'ALREADY_RATED' || error.response?.data?.code === 'DUPLICATE_RATING') {
      return true;
    }
    
    // Normalize error message to lowercase for comparison
    const errorMessage = error.response?.data?.error || error.message || '';
    const normalizedMessage = errorMessage.toLowerCase();
    
    // Check for common duplicate rating indicators
    const duplicateIndicators = ['already rated', 'already submitted', 'duplicate rating', 'rating already exists'];
    return duplicateIndicators.some(indicator => normalizedMessage.includes(indicator));
  };

  const submitRating = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/trips/${tripId}/rate`, {
        rating,
        comment: comment.trim()
      });
      
      setSubmitted(true);
      Alert.alert('Success', 'Thank you for your rating!', [
        {
          text: 'OK',
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }]
            });
          }
        }
      ]);
    } catch (error) {
      console.error('Submit Rating Error:', error);
      
      if (isDuplicateRatingError(error)) {
        Alert.alert('Already Rated', 'You have already rated this trip', [
          { text: 'OK', onPress: () => navigation.navigate('Main') }
        ]);
      } else {
        const errorMessage = buildNetworkErrorMessage(error, 'Failed to submit rating');
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderRateeAvatar = () => {
    // If photo URL exists and image hasn't errored, show Image component
    if (rateePhotoUrl && !imageError) {
      return (
        <Image
          source={{ uri: rateePhotoUrl }}
          style={styles.rateeAvatarImage}
          onError={() => setImageError(true)}
        />
      );
    }
    
    // Fallback to initial-based avatar
    return (
      <View style={styles.rateeAvatar}>
        <Text style={styles.rateeAvatarText}>
          {tripData?.rateeName?.charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
    );
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successText}>Rating submitted successfully!</Text>
        <Text style={styles.successSubtext}>Redirecting to home...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Rate Your Trip</Text>
      
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ marginTop: 16, color: '#6b7280' }}>Loading trip details...</Text>
        </View>
      ) : tripData ? (
        <>
          {/* Ratee Information Card */}
          <View style={styles.ratingCard}>
            {renderRateeAvatar()}
            <Text style={styles.rateeName}>{tripData.rateeName}</Text>
            {tripData.vehicleInfo && (
              <Text style={styles.rateeVehicle}>{tripData.vehicleInfo}</Text>
            )}
            
            {/* Trip Route */}
            <View style={styles.tripRouteContainer}>
              <View style={styles.tripRouteRow}>
                <View style={[styles.tripRouteDot, styles.tripRouteDotPickup]} />
                <Text style={styles.tripRouteAddress}>{tripData.route.pickup}</Text>
              </View>
              <View style={styles.tripRouteLine} />
              <View style={styles.tripRouteRow}>
                <View style={[styles.tripRouteDot, styles.tripRouteDotDrop]} />
                <Text style={styles.tripRouteAddress}>{tripData.route.dropoff}</Text>
              </View>
            </View>
            
            <Text style={styles.ratingTripPrice}>PKR {tripData.price}</Text>
          </View>

          {/* Rating Section */}
          <View style={styles.ratingSection}>
            <Text style={styles.ratingLabel}>How was your experience?</Text>
            {renderStars()}
            <Text style={styles.ratingText}>
              {rating > 0 ? `Rating: ${rating}/5` : 'Tap to rate'}
            </Text>
          </View>

          {/* Comment Section */}
          <View style={styles.commentSection}>
            <Text style={styles.label}>Additional Comments</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Share your experience (optional)"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.characterCount}>
              {comment.length}/500 characters
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (rating === 0 || submitting) && styles.submitButtonDisabled
            ]}
            onPress={submitRating}
            disabled={rating === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Rating</Text>
            )}
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#1f2937' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#374151' },
  button: { backgroundColor: '#ec4899', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  ratingCard: { 
    backgroundColor: '#f9fafb', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: '#e5e7eb', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 4, 
    elevation: 3 
  },
  rateeAvatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#ec4899', 
    justifyContent: 'center', 
    alignItems: 'center', 
    alignSelf: 'center', 
    marginBottom: 16 
  },
  rateeAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: '#e5e7eb'
  },
  rateeAvatarText: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  rateeName: { fontSize: 24, fontWeight: 'bold', color: '#1f2937', textAlign: 'center', marginBottom: 8 },
  rateeVehicle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  tripRouteContainer: { marginBottom: 12 },
  tripRouteRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  tripRouteDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  tripRouteDotPickup: { backgroundColor: '#10b981' },
  tripRouteDotDrop: { backgroundColor: '#ef4444' },
  tripRouteAddress: { flex: 1, fontSize: 14, color: '#374151' },
  tripRouteLine: { width: 2, height: 16, backgroundColor: '#d1d5db', marginLeft: 4, marginVertical: 2 },
  ratingTripPrice: { fontSize: 20, fontWeight: 'bold', color: '#10b981', textAlign: 'center' },
  ratingSection: { marginBottom: 24 },
  ratingLabel: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 12, textAlign: 'center' },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  starButton: { padding: 4, marginHorizontal: 4 },
  starText: { fontSize: 48 },
  starFilled: { color: '#fbbf24' },
  starEmpty: { color: '#d1d5db' },
  ratingText: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
  commentSection: { marginBottom: 24 },
  commentInput: { 
    borderWidth: 1, 
    borderColor: '#d1d5db', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16, 
    backgroundColor: '#f9fafb', 
    minHeight: 100, 
    textAlignVertical: 'top' 
  },
  characterCount: { fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 4 },
  submitButton: { backgroundColor: '#ec4899', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitButtonDisabled: { backgroundColor: '#d1d5db', opacity: 0.5 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  successIcon: { fontSize: 64, marginBottom: 20 },
  successText: { fontSize: 20, fontWeight: 'bold', color: '#10b981', textAlign: 'center', marginBottom: 8 },
  successSubtext: { fontSize: 16, color: '#6b7280', textAlign: 'center' }
});

