import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from './config/app.config';
import { api, setAuthToken, getAuthToken, connectSocket, getSocket, socketManager } from './services/network';
import ChatScreen from './screens/ChatScreen';
import CallScreen from './screens/CallScreen';
import RatingScreen from './screens/RatingScreen';
import DriverRegistrationScreen from './screens/DriverRegistrationScreen';
import ImageUpload from './components/ImageUpload';
import { buildNetworkErrorMessage } from './utils/errors';
import { normalizeTripId, getUserData as getUserDataStorage, setUserData as setUserDataStorage, getEmergencyContacts, setEmergencyContacts, clearAuthTokens, normalizeContact, getDriverData as getDriverDataFromStorage, setDriverData as setDriverDataToStorage, setRefreshToken } from './utils/storage';
import { requestForegroundLocationPermission, getCurrentLocation } from './utils/location';
import { ToastProvider, showToast } from './utils/toast';
import { retryWithBackoff } from './utils/retry';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';


const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ========================================
// ERROR HANDLING HELPERS
// ========================================

// ========================================
// API CLIENT (imported from services/network.js)
// ========================================

// ========================================
// CONSTANTS
// ========================================
const ALLOWED_VEHICLE_TYPES = ['car', 'bike', 'ev_bike'];
const DEFAULT_COUNTRY_CODE = '+92';
const DEFAULT_COUNTRY_CODE_DIGITS = DEFAULT_COUNTRY_CODE.slice(1);
const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// ========================================
// SCREEN 1: WELCOME SCREEN
// ========================================
function WelcomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.welcomeContainer}>
      <View style={styles.centerContainer}>
        <Image
          source={require('./assets/icon.png')}
          style={styles.welcomeLogo}
          resizeMode="contain"
        />
        <Text style={styles.welcomeTitle}>SafeRide</Text>
        <Text style={styles.welcomeTagline}>Your trusted ride companion</Text>
      </View>
      <View style={[styles.welcomeButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.button, styles.loginButton]}
          onPress={() => navigation.navigate('LoginFlow')}
        >
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.signInButton]}
          onPress={() => navigation.navigate('SignInFlow')}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
        <Text style={styles.welcomeHelperText}>New to SafeRide?</Text>
      </View>
    </View>
  );
}

// ========================================
// SCREEN 2: SPLASH SCREEN
// ========================================
function SplashScreen({ navigation }) {
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = await getAuthToken();
    setTimeout(() => {
      if (token) {
        navigation.replace('Main');
      } else {
        navigation.replace('Welcome');
      }
    }, 2000);
  };

  return (
    <View style={styles.splashContainer}>
      <Text style={styles.splashTitle}>SafeRide</Text>
      <Text style={styles.splashSubtitle}>Women</Text>
      <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 20 }} />
    </View>
  );
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function normalizePhoneNumber(rawPhone) {
  if (!rawPhone) return '';

  // Remove all whitespace, dashes, parentheses, and other common formatting characters
  const trimmed = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (!trimmed) return '';

  // Handle numbers starting with +
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return '';
    const candidate = `+${digits}`;
    return E164_PHONE_REGEX.test(candidate) ? candidate : '';
  }

  // Extract all digits
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return '';

  // Handle numbers starting with 00 (international prefix)
  if (trimmed.startsWith('00') || digitsOnly.startsWith('00')) {
    const withoutPrefix = digitsOnly.replace(/^0{2,}/, '');
    if (!withoutPrefix) return '';
    const candidate = `+${withoutPrefix}`;
    return E164_PHONE_REGEX.test(candidate) ? candidate : '';
  }

  // Handle numbers that already start with country code (92)
  // This covers cases like 923001234567, 9203001234567, etc.
  if (digitsOnly.startsWith(DEFAULT_COUNTRY_CODE_DIGITS)) {
    const candidate = `+${digitsOnly}`;
    if (E164_PHONE_REGEX.test(candidate)) {
      return candidate;
    }
    // If it's too long, try removing leading zeros after country code
    const withoutLeadingZeros = digitsOnly.replace(/^92(0+)/, '92');
    if (withoutLeadingZeros !== digitsOnly) {
      const candidate2 = `+${withoutLeadingZeros}`;
      if (E164_PHONE_REGEX.test(candidate2)) {
        return candidate2;
      }
    }
  }

  // Handle local numbers (typically starting with 0, like 0300, 0301, etc.)
  // Pakistani mobile numbers are 10 digits (without country code)
  // Remove leading zeros to get the national number
  const nationalNumber = digitsOnly.replace(/^0+/, '');
  if (!nationalNumber) return '';

  // Construct E.164 format with default country code
  // E164 validation will ensure the final format is correct
  const candidate = `${DEFAULT_COUNTRY_CODE}${nationalNumber}`;
  return E164_PHONE_REGEX.test(candidate) ? candidate : '';
}

/**
 * Sanitizes user data by stripping base64 data URIs from profilePictureUrl before storing.
 * Base64 data URIs should not be persisted to AsyncStorage as they can be large.
 * Returns a copy of the user object with profilePictureUrl set to null if it's a base64 data URI.
 */
function sanitizeUserDataForStorage(userData) {
  if (!userData) return userData;
  
  // Check if profilePictureUrl is a base64 data URI (starts with "data:")
  if (userData.profilePictureUrl && typeof userData.profilePictureUrl === 'string' && userData.profilePictureUrl.startsWith('data:')) {
    // Return a copy with profilePictureUrl removed (don't persist base64 data)
    const { profilePictureUrl, ...sanitizedUserData } = userData;
    return sanitizedUserData;
  }
  
  // If it's a regular URL or null, return as-is
  return userData;
}

async function sendOTPRequest(phone, setLoading, setStep) {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    Alert.alert('Error', 'Please enter a valid phone number');
    return;
  }

  setLoading(true);

  if (config.isDevelopment || config.SHOW_VERBOSE_ERRORS) {
    console.log('Sending OTP to:', `${config.API_URL}/auth/otp`);
  }

  try {
    const response = await retryWithBackoff(() => api.post('/auth/otp', { phone: normalizedPhone }));

    if (config.isDevelopment || config.SHOW_VERBOSE_ERRORS) {
      Alert.alert('Success', `OTP sent! For testing use: ${response.data?.otp || '123456'}`);
    } else {
      Alert.alert('Success', 'OTP sent! Please check your phone.');
    }

    setStep('otp');
  } catch (error) {
    console.error('OTP Error:', error);
    const errorMessage = buildNetworkErrorMessage(error, 'Failed to send OTP');
    Alert.alert('Error', errorMessage);
  } finally {
    setLoading(false);
  }
}

async function handlePostAuthentication(token, userData, navigation, refreshToken = null) {
  try {
    await setAuthToken(token);
    if (refreshToken) {
      await setRefreshToken(refreshToken);
    }
    const sanitizedUserData = sanitizeUserDataForStorage(userData);
    await setUserDataStorage(sanitizedUserData);
    await connectSocket(token);

    if (userData?.role === 'driver') {
      try {
        const meResponse = await api.get('/me');
        const currentUser = meResponse.data;

        if (!currentUser?.driver) {
          navigation.replace('DriverRegistration');
          return;
        }
      } catch (error) {
        console.error('Error checking driver status:', error);
      }
    }

    navigation.replace('Main');
  } catch (error) {
    console.error('Post authentication error:', error);
    navigation.replace('Main');
  }
}

function validateOTPFormat(otp) {
  return /^\d{6}$/.test(otp);
}

function validatePhoneFormat(phone) {
  return !!normalizePhoneNumber(phone);
}

// ========================================
// SCREEN 2: LOGIN SCREEN
// ========================================
function LoginFlow({ navigation }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const phoneWhenOTPSent = useRef('');

  // Track phone number when OTP is successfully sent (step changes to 'otp')
  useEffect(() => {
    if (step === 'otp' && phoneWhenOTPSent.current === '') {
      phoneWhenOTPSent.current = phone;
    } else if (step === 'phone') {
      // Reset when going back to phone step
      phoneWhenOTPSent.current = '';
    }
  }, [step, phone]);

  // Reset OTP when phone changes after OTP has been sent
  useEffect(() => {
    if ((step === 'otp' || step === 'profile') && phone !== phoneWhenOTPSent.current && phoneWhenOTPSent.current !== '') {
      setOtp('');
    }
  }, [phone, step]);

  // Keyboard visibility detection
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Reset state when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      setPhone('');
      setOtp('');
      setStep('phone');
      phoneWhenOTPSent.current = '';
    }, [])
  );

  // Calculate dynamic padding based on keyboard visibility and screen height
  const screenHeight = Dimensions.get('window').height;
  const isSmallScreen = screenHeight < 700;
  const shouldReducePadding = isKeyboardVisible || isSmallScreen;
  const dynamicPaddingBottom = shouldReducePadding ? 20 : 60;

  const handleSendOTP = () => {
    sendOTPRequest(phone, setLoading, setStep);
  };

  const handleVerifyOTP = async () => {
    if (!validateOTPFormat(otp)) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      Alert.alert('Error', 'Please re-enter a valid phone number.');
      setStep('phone');
      return;
    }

    setLoading(true);

    try {
      const response = await retryWithBackoff(() =>
        api.post('/auth/verify', { phone: normalizedPhone, otp, flow: 'login' })
      );
      await handlePostAuthentication(response.data.token, response.data.user, navigation, response.data.refreshToken);
  } catch (error) {
    const status = error.response?.status;

    if (status === 404) {
        Alert.alert(
          'Account Not Found',
          'No account found with this phone number. Please sign up first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Up', onPress: () => navigation.replace('SignInFlow') }
          ]
        );
      } else {
        const message = buildNetworkErrorMessage(error, 'Failed to verify OTP');
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.container}>
        <View style={styles.loginHeader}>
          <Text style={styles.loginFlowTitle}>Welcome Back</Text>
          <Text style={styles.flowSubtitle}>Log in to continue</Text>
        </View>

        {step === 'phone' && (
          <View style={[styles.loginForm, { paddingBottom: dynamicPaddingBottom }]}>
            <Text style={styles.label}>Enter Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="0300 1234567 or +92 300 1234567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <Text style={styles.helperText}>
              You can enter a local number (e.g., 0300 1234567) or include the country code.
            </Text>
            <TouchableOpacity style={styles.button} onPress={handleSendOTP} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send OTP'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => navigation.replace('SignInFlow')}>
              <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' && (
          <View style={[styles.loginForm, { paddingBottom: dynamicPaddingBottom }]}>
            <Text style={styles.label}>Enter OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
            <TouchableOpacity style={styles.button} onPress={handleVerifyOTP} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                setStep('phone');
                setOtp('');
              }}
            >
              <Text style={styles.linkText}>Change Number</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function SignInFlow({ navigation }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('female'); // Default to 'female' (SafeRide is women-only)
  const [role, setRole] = useState('passenger');
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const phoneWhenOTPSent = useRef('');

  // Track phone number when OTP is successfully sent (step changes to 'otp')
  useEffect(() => {
    if (step === 'otp' && phoneWhenOTPSent.current === '') {
      phoneWhenOTPSent.current = phone;
    } else if (step === 'phone') {
      // Reset when going back to phone step
      phoneWhenOTPSent.current = '';
    }
  }, [step, phone]);

  // Reset OTP when phone changes after OTP has been sent
  useEffect(() => {
    if ((step === 'otp' || step === 'profile') && phone !== phoneWhenOTPSent.current && phoneWhenOTPSent.current !== '') {
      setOtp('');
    }
  }, [phone, step]);

  // Keyboard visibility detection
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Reset state when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      setPhone('');
      setOtp('');
      setName('');
      setGender('female');
      setRole('passenger');
      setProfilePictureUrl(null);
      setStep('phone');
      phoneWhenOTPSent.current = '';
    }, [])
  );

  // Calculate dynamic padding based on keyboard visibility and screen height
  const screenHeight = Dimensions.get('window').height;
  const isSmallScreen = screenHeight < 700;
  const shouldReducePadding = isKeyboardVisible || isSmallScreen;
  const dynamicPaddingBottom = shouldReducePadding ? 20 : 60;

  const handleSendOTP = () => {
    sendOTPRequest(phone, setLoading, setStep);
  };

  const handleOTPSubmit = () => {
    if (!validateOTPFormat(otp)) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    setStep('profile');
  };

  const handleCreateAccount = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name to create an account');
      return;
    }

    if (!validateOTPFormat(otp)) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      Alert.alert('Error', 'Please re-enter a valid phone number.');
      setStep('phone');
      return;
    }

    // Enforce female-only policy: SafeRide is exclusively for women
    const normalizedGender = gender ? gender.toLowerCase() : '';
    if (normalizedGender === 'male') {
      Alert.alert('Error', 'SafeRide is exclusively for women. Only female users can register.');
      return;
    }
    if (normalizedGender !== 'female') {
      Alert.alert('Error', 'SafeRide is exclusively for women. Only female users can register.');
      return;
    }

    // Ensure profile picture is uploaded (URL) and not base64
    if (profilePictureUrl && profilePictureUrl.startsWith('data:')) {
      Alert.alert('Error', 'Profile picture must be uploaded before creating an account. Please re-select the image.');
      return;
    }

    setLoading(true);

    try {
      const response = await retryWithBackoff(() =>
        api.post('/auth/verify', {
          phone: normalizedPhone,
          otp,
          name: name.trim() || 'User',
          role,
          profilePictureUrl,
          gender: normalizedGender,
          flow: 'sign-in'
        })
      );
      await handlePostAuthentication(response.data.token, response.data.user, navigation, response.data.refreshToken);
  } catch (error) {
    const status = error.response?.status;

    if (status === 409) {
        Alert.alert(
          'Account Already Exists',
          'An account with this phone number already exists. Please login instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => navigation.replace('LoginFlow') }
          ]
        );
      } else {
        const message = buildNetworkErrorMessage(error, 'Failed to create account');
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.container}>
        <View style={styles.loginHeader}>
          <Text style={styles.signInFlowTitle}>Create Account</Text>
          <Text style={styles.flowSubtitle}>Join SafeRide in a few easy steps</Text>
        </View>

        {step === 'phone' && (
          <View style={[styles.loginForm, { paddingBottom: dynamicPaddingBottom }]}>
            <Text style={styles.label}>Enter Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="0300 1234567 or +92 300 1234567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <Text style={styles.helperText}>
              You can enter a local number (e.g., 0300 1234567) or include the country code.
            </Text>
            <TouchableOpacity style={styles.button} onPress={handleSendOTP} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send OTP'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => navigation.replace('LoginFlow')}>
              <Text style={styles.linkText}>Already have an account? Login</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' && (
          <View style={[styles.loginForm, { paddingBottom: dynamicPaddingBottom }]}>
            <Text style={styles.label}>Enter OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
            <TouchableOpacity style={styles.button} onPress={handleOTPSubmit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Continue'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                setStep('phone');
                setOtp('');
              }}
            >
              <Text style={styles.linkText}>Change Number</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'profile' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.loginForm, { paddingBottom: dynamicPaddingBottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            <View>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                editable={!loading}
              />
              <ImageUpload
                label="Profile Picture (Optional)"
                uploadMode="server"
                allowsEditing
                aspect={[1, 1]}
                onImageSelected={setProfilePictureUrl}
                imageUri={profilePictureUrl}
              />
              <Text style={styles.helperText}>This helps drivers/passengers recognize you</Text>

              {/* SafeRide is exclusively for women. 'Male' option is shown but blocked
                  during validation to clearly communicate the women-only policy. */}
              <Text style={styles.label}>Gender</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity
                  style={[styles.roleBtn, gender === 'female' && styles.roleBtnActive]}
                  onPress={() => setGender('female')}
                  disabled={loading}
                >
                  <Text style={[styles.roleText, gender === 'female' && styles.roleTextActive]}>
                    Female
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, gender === 'male' && styles.roleBtnActive]}
                  onPress={() => setGender('male')}
                  disabled={loading}
                >
                  <Text style={[styles.roleText, gender === 'male' && styles.roleTextActive]}>
                    Male
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>I am a</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'passenger' && styles.roleBtnActive]}
                  onPress={() => setRole('passenger')}
                  disabled={loading}
                >
                  <Text style={[styles.roleText, role === 'passenger' && styles.roleTextActive]}>
                    Passenger
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, role === 'driver' && styles.roleBtnActive]}
                  onPress={() => setRole('driver')}
                  disabled={loading}
                >
                  <Text style={[styles.roleText, role === 'driver' && styles.roleTextActive]}>
                    Driver
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.button} onPress={handleCreateAccount} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkButton} onPress={() => setStep('otp')}>
                <Text style={styles.linkText}>Back to OTP</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ========================================
// SCREEN 3: PASSENGER HOME
// ========================================
function PassengerHomeScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [userData, setUserData] = useState(null);
  const [sosLoading, setSosLoading] = useState(false);

  useEffect(() => {
    loadUserData();
    getLocation();
  }, []);

  const loadUserData = async () => {
    const data = await getUserDataStorage();
    if (data) setUserData(data);
  };

  const getLocation = async () => {
    const result = await requestForegroundLocationPermission();
    if (result.granted) {
      setLocation(result.location);
    }
  };

  const handleSOS = async () => {
    Alert.alert(
      'Emergency SOS',
      'This will alert emergency services and your emergency contacts. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            if (sosLoading) return;
            setSosLoading(true);
            try {
              // Get current location
              const locationResult = await requestForegroundLocationPermission();
              if (!locationResult.granted) {
                setSosLoading(false);
                return;
              }

              const currentLocationCoords = locationResult.location;
              if (!currentLocationCoords) {
                Alert.alert('Error', 'Unable to get your current location');
                setSosLoading(false);
                return;
              }
              
              // Retrieve emergency contacts
              const contacts = await getEmergencyContacts();
              const emergencyContact = contacts?.emergencyContact || null;

              if (!emergencyContact) {
                Alert.alert(
                  'No Emergency Contact',
                  'Please add an emergency contact first.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel'
                    },
                    {
                      text: 'Add Contacts',
                      onPress: () => navigation.navigate('EmergencyContacts')
                    }
                  ]
                );
                setSosLoading(false);
                return;
              }

              // Normalize contact before sending
              const normalizedContact = normalizeContact(emergencyContact);
              if (!normalizedContact) {
                Alert.alert('Error', 'Invalid emergency contact data');
                setSosLoading(false);
                return;
              }

              // Call SOS API with normalized contact
              const sosData = {
                emergency_contact: normalizedContact,
                message: 'Emergency SOS from passenger',
                location_lat: currentLocation.coords.latitude,
                location_lng: currentLocation.coords.longitude
              };

              const response = await api.post('/sos', sosData);

              // Broadcast via Socket.io
              const socket = getSocket();
              if (socket) {
                socket.emit('sos_alert', sosData);
              }

              Alert.alert('SOS Sent', 'Emergency services and your contacts have been notified');
            } catch (error) {
              console.error('SOS Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to send SOS');
              Alert.alert('Error', errorMessage);
            } finally {
              setSosLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.userName}>{userData?.name || 'User'}</Text>
        </View>
        <TouchableOpacity style={styles.sosBtn} onPress={handleSOS} disabled={sosLoading}>
          {sosLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sosText}>SOS</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            showsUserLocation
          >
            <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text>Loading map...</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate('BookRide', { location })}
      >
        <Text style={styles.bookButtonText}>📍 Book a Ride</Text>
      </TouchableOpacity>
    </View>
  );
}

// ========================================
// SCREEN 4: BOOK RIDE
// ========================================
function BookRideScreen({ route, navigation }) {
  const { location } = route.params;
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [price, setPrice] = useState('');
  const [vehicleType, setVehicleType] = useState('car'); // Default 'car'
  const [loading, setLoading] = useState(false);
  const [tripId, setTripId] = useState(null);
  const [offers, setOffers] = useState([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (tripId) {
      socketManager.joinTrip(tripId);
      const socket = getSocket();
      if (socket) {
        socket.on('new_offer', (offer) => {
          setOffers((prev) => [...prev, offer]);
          showToast(`New Offer! PKR ${offer.price_offer} by ${offer.driver_name}`, { throttle: true });
        });
      }
      
      return () => {
        socketManager.leaveTrip(tripId);
        const socket = getSocket();
        if (socket) {
          socket.off('new_offer');
        }
      };
    }
  }, [tripId]);

  const createTrip = async () => {
    if (!pickup || !dropoff || !price || !vehicleType) {
      Alert.alert('Error', 'Please fill all fields and select a vehicle type.');
      return;
    }

    // Validate vehicle type
    if (!ALLOWED_VEHICLE_TYPES.includes(vehicleType)) {
      Alert.alert('Error', `Invalid vehicle type. Please select one of: ${ALLOWED_VEHICLE_TYPES.join(', ')}`);
      return;
    }

    // Validate price
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum > 100000) {
      Alert.alert('Error', 'Please enter a valid price between 1 and 100,000 PKR');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/trips', {
        pickup_lat: location?.latitude || 31.5204,
        pickup_lng: location?.longitude || 74.3587,
        pickup_address: pickup,
        drop_lat: 31.4697,
        drop_lng: 74.2728,
        drop_address: dropoff,
        proposed_price: priceNum,
        vehicle_type: vehicleType,
      });
      setTripId(res.data.id);
      Alert.alert('Success', 'Trip created! Waiting for offers...');
    } catch (error) {
      console.error('Create Trip Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to create trip');
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const acceptOffer = async (offer) => {
    try {
      await api.post(`/trips/${tripId}/accept`, { offer_id: offer.offer_id });

      const vehicleInfo = offer.vehicle_info ||
        `${offer.vehicle_make || ''} ${offer.vehicle_model || ''} - ${offer.vehicle_plate || ''}`.trim() ||
        'Vehicle information not available';
      navigation.navigate('ActiveTrip', {
        tripId,
        driverId: offer.driver_id,
        driverName: offer.driver_name,
        vehicleInfo,
        acceptedPrice: offer.price_offer,
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        pickupCoords: { latitude: location?.latitude || 31.5204, longitude: location?.longitude || 74.3587 },
        dropoffCoords: { latitude: 31.4697, longitude: 74.2728 }
      });
    } catch (error) {
      console.error('Accept Offer Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to accept offer');
      Alert.alert('Error', errorMessage);
    }
  };

  const handleCancelTrip = async () => {
    if (!tripId) {
      Alert.alert('Error', 'No trip ID available to cancel.');
      return;
    }
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip request?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.post(`/trips/${tripId}/cancel`);
              socketManager.leaveTrip(tripId);
              setOffers([]);
              setTripId(null);
              Alert.alert('Trip Cancelled', 'Your trip request has been cancelled.');
              navigation.goBack();
            } catch (error) {
              console.error('Cancel Trip Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to cancel trip');
              Alert.alert('Error', errorMessage);
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  if (tripId && offers.length > 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{offers.length} Offers Available</Text>
        <ScrollView>
          {offers.map((offer, idx) => (
            <View key={idx} style={styles.offerCard}>
              <Text style={styles.driverName}>{offer.driver_name}</Text>
              <Text>{offer.vehicle_info}</Text>
              <Text style={styles.offerPrice}>PKR {offer.price_offer}</Text>
              <Text>ETA: {offer.eta_minutes} min</Text>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptOffer(offer)}>
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity 
          style={[styles.button, styles.cancelButton]} 
          onPress={handleCancelTrip}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Cancel Trip Request</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Book a Ride</Text>
      <TextInput style={styles.input} placeholder="Pickup Location" value={pickup} onChangeText={setPickup} />
      <TextInput style={styles.input} placeholder="Drop-off Location" value={dropoff} onChangeText={setDropoff} />
      <TextInput style={styles.input} placeholder="Your Price (PKR)" value={price} onChangeText={setPrice} keyboardType="numeric" />
      
      {/* Simple Vehicle Type Selector - Below Address & Price */}
      <Text style={styles.label}>Select Vehicle Type</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[styles.roleBtn, vehicleType === 'car' && styles.roleBtnActive]}
          onPress={() => setVehicleType('car')}
        >
          <Text style={[styles.roleText, vehicleType === 'car' && styles.roleTextActive]}>Car</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleBtn, vehicleType === 'bike' && styles.roleBtnActive]}
          onPress={() => setVehicleType('bike')}
        >
          <Text style={[styles.roleText, vehicleType === 'bike' && styles.roleTextActive]}>Bike</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleBtn, vehicleType === 'ev_bike' && styles.roleBtnActive]}
          onPress={() => setVehicleType('ev_bike')}
        >
          <Text style={[styles.roleText, vehicleType === 'ev_bike' && styles.roleTextActive]}>EV Bike</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={createTrip} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Request Ride'}</Text>
      </TouchableOpacity>
      {tripId && !offers.length && (
        <TouchableOpacity 
          style={[styles.button, styles.cancelButton]} 
          onPress={handleCancelTrip}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Cancel Trip Request</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};
// ========================================
// SCREEN 5: ACTIVE TRIP SCREEN
// ========================================
function ActiveTripScreen({ route, navigation }) {
  const { 
    tripId, 
    driverId, 
    driverName, 
    vehicleInfo, 
    acceptedPrice, 
    pickupAddress, 
    dropoffAddress, 
    pickupCoords, 
    dropoffCoords 
  } = route.params || {};

  const [tripStatus, setTripStatus] = useState('accepted');
  const [driverLocation, setDriverLocation] = useState(null);
  const [isShared, setIsShared] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const mapRef = React.useRef(null);

  useEffect(() => {
    if (!tripId) return;

    let currentSocket = getSocket();
    let isMounted = true;

    // Ensure socket is connected
    const setupSocket = async () => {
      if (!currentSocket) {
        const token = await getAuthToken();
        if (token) {
          currentSocket = await connectSocket(token);
        }
      }
      
      if (!currentSocket || !isMounted) {
        if (!isMounted) return;
        console.warn('Socket not available for ActiveTripScreen');
        return;
      }

      // Join trip room using socketManager
      socketManager.joinTrip(tripId);

      // Listen for trip_started
      const handleTripStarted = (data) => {
        if (!isMounted) return;
        if (data.trip_id === tripId) {
          setTripStatus('in_progress');
        }
      };

      // Listen for trip_completed
      const handleTripCompleted = (data) => {
        if (!isMounted) return;
        if (data.trip_id === tripId) {
          setTripStatus('completed');
          Alert.alert('Trip Completed', 'Your trip has been completed! Please rate your experience.', [
            { 
              text: 'Rate Trip', 
              onPress: () => navigation.navigate('Rating', { tripId, driverName, vehicleInfo }) 
            }
          ]);
        }
      };

      // Listen for location_update
      const handleLocationUpdate = (data) => {
        if (!isMounted) return;
        if (data.driverId === driverId) {
          const newLocation = {
            latitude: data.lat,
            longitude: data.lng,
          };
          setDriverLocation(newLocation);
          
          // Animate map to driver location
          if (mapRef.current && newLocation.latitude && newLocation.longitude) {
            mapRef.current.animateToRegion({
              ...newLocation,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 1000);
          }
        }
      };

      // Listen for trip_cancelled
      const handleTripCancelled = (data) => {
        if (!isMounted) return;
        if (data.trip_id === tripId) {
          socketManager.leaveTrip(tripId);
          Alert.alert(
            'Trip Cancelled',
            'This trip has been cancelled.',
            [
              {
                text: 'OK',
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Main' }]
                  });
                }
              }
            ]
          );
        }
      };

      currentSocket.on('trip_started', handleTripStarted);
      currentSocket.on('trip_completed', handleTripCompleted);
      currentSocket.on('location_update', handleLocationUpdate);
      currentSocket.on('trip_cancelled', handleTripCancelled);

      // Return cleanup function
      return () => {
        socketManager.leaveTrip(tripId);
        if (currentSocket) {
          currentSocket.off('trip_started', handleTripStarted);
          currentSocket.off('trip_completed', handleTripCompleted);
          currentSocket.off('location_update', handleLocationUpdate);
          currentSocket.off('trip_cancelled', handleTripCancelled);
        }
      };
    };

    let cleanupFn = null;
    const socketPromise = setupSocket();
    socketPromise.then(cleanup => {
      if (cleanup) cleanupFn = cleanup;
    });

    // Cleanup on unmount
    return () => {
      isMounted = false;
      socketPromise.then(cleanup => {
        if (cleanup) cleanup();
      }).catch(() => {});
      if (cleanupFn) cleanupFn();
    };
  }, [tripId, driverId, navigation]);

  const getStatusBarColor = () => {
    switch (tripStatus) {
      case 'accepted': return '#10b981';
      case 'in_progress': return '#3b82f6';
      case 'completed': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (tripStatus) {
      case 'accepted': return 'Driver Accepted - Waiting for pickup';
      case 'in_progress': return 'Trip In Progress';
      case 'completed': return 'Trip Completed';
      default: return 'Active Trip';
    }
  };

  const handleChat = () => {
    navigation.navigate('Chat', { tripId, driverId, driverName });
  };

  const handleCall = () => {
    navigation.navigate('Call', { tripId, driverId, driverName });
  };

  const handleSOS = async () => {
    Alert.alert(
      'Send Emergency Alert',
      'Send emergency alert?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            if (sosLoading) return;
            setSosLoading(true);
            try {
              // Get location (use driverLocation if available, otherwise pickupCoords, or get fresh location)
              let location = driverLocation || pickupCoords;
              if (!location) {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                  const currentLocation = await Location.getCurrentPositionAsync({});
                  location = currentLocation.coords;
                }
              }

              // Validate location before proceeding
              if (!location || location.latitude == null || location.longitude == null) {
                Alert.alert(
                  'Location Required',
                  'Unable to determine your location. Please enable location services in settings to send SOS alerts.'
                );
                setSosLoading(false);
                return;
              }

              // Retrieve emergency contacts
              const contacts = await getEmergencyContacts();
              const emergencyContact = contacts?.emergencyContact || null;

              if (!emergencyContact) {
                Alert.alert(
                  'No Emergency Contact',
                  'Please add an emergency contact first.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel'
                    },
                    {
                      text: 'Add Contacts',
                      onPress: () => navigation.navigate('EmergencyContacts')
                    }
                  ]
                );
                setSosLoading(false);
                return;
              }

              // Normalize contact before sending
              const normalizedContact = normalizeContact(emergencyContact);
              if (!normalizedContact) {
                Alert.alert('Error', 'Invalid emergency contact data');
                setSosLoading(false);
                return;
              }

              // Call SOS API with normalized contact
              const sosData = {
                trip_id: String(tripId), // Normalize tripId to string
                emergency_contact: normalizedContact,
                message: 'Emergency during trip',
                location_lat: location.latitude,
                location_lng: location.longitude
              };

              await api.post('/sos', sosData);

              // Also emit socket event for real-time notification
              const socket = getSocket();
              if (socket) {
                socket.emit('sos_alert', sosData);
              }

              Alert.alert('SOS Sent', 'Emergency alert sent! Help is on the way.');
            } catch (error) {
              console.error('SOS Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to send SOS');
              Alert.alert('Error', errorMessage);
            } finally {
              setSosLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShareTrip = async () => {
    Alert.alert(
      'Share Trip',
      'Share your live trip details with trusted contacts?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Share Trip',
          onPress: async () => {
            if (shareLoading) return;
            setShareLoading(true);
            try {
              // Retrieve trusted contacts from storage
              const contacts = await getEmergencyContacts();
              const trustedContacts = contacts?.trustedContacts || [];

              if (!trustedContacts || trustedContacts.length === 0) {
                Alert.alert(
                  'No Trusted Contacts',
                  'No trusted contacts found. Add contacts in your profile.'
                );
                setShareLoading(false);
                return;
              }

              // Share trip with all trusted contacts in a single request
              const contactIds = trustedContacts.map(c => c.id || c.phone);
              await api.post(`/trips/${tripId}/share`, {
                contact_ids: contactIds
              });

              setIsShared(true);
              Alert.alert('Trip Shared', 'Your trip details have been shared with your trusted contacts');
            } catch (error) {
              console.error('Share Trip Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to share trip');
              Alert.alert('Error', errorMessage);
            } finally {
              setShareLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCancelTrip = async () => {
    if (!tripId) {
      Alert.alert('Error', 'No trip ID available to cancel.');
      return;
    }
    const message = tripStatus === 'accepted' 
      ? 'Cancel this trip? The driver has already accepted.'
      : tripStatus === 'in_progress'
      ? 'Cancel active trip? This should only be done in emergencies.'
      : 'Are you sure you want to cancel this trip?';

    Alert.alert(
      'Cancel Trip',
      message,
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.post(`/trips/${tripId}/cancel`);
              socketManager.leaveTrip(tripId);
              Alert.alert('Trip Cancelled', 'Your trip has been cancelled.');
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }]
              });
            } catch (error) {
              console.error('Cancel Trip Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to cancel trip');
              Alert.alert('Error', errorMessage);
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  // Calculate region for map
  const mapRegion = React.useMemo(() => {
    const points = [pickupCoords, dropoffCoords];
    if (driverLocation) points.push(driverLocation);
    
    const lats = points.map(p => p.latitude).filter(Boolean);
    const lngs = points.map(p => p.longitude).filter(Boolean);
    
    if (lats.length === 0) return null;
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.01),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.01),
    };
  }, [pickupCoords, dropoffCoords, driverLocation]);

  return (
    <View style={styles.activeTripContainer}>
      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: getStatusBarColor() }]}>
        <Text style={styles.statusBarText}>{getStatusText()}</Text>
      </View>

      {/* Map */}
      {mapRegion && pickupCoords && pickupCoords.latitude != null && pickupCoords.longitude != null && dropoffCoords && dropoffCoords.latitude != null && dropoffCoords.longitude != null ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.activeTripMap}
          initialRegion={mapRegion}
          showsUserLocation
        >
          {/* Pickup Marker */}
          {pickupCoords && pickupCoords.latitude != null && pickupCoords.longitude != null && (
            <Marker
              coordinate={pickupCoords}
              title="Pickup"
              pinColor="#10b981"
            />
          )}
          
          {/* Dropoff Marker */}
          {dropoffCoords && dropoffCoords.latitude != null && dropoffCoords.longitude != null && (
            <Marker
              coordinate={dropoffCoords}
              title="Dropoff"
              pinColor="#ef4444"
            />
          )}
          
          {/* Driver Marker */}
          {driverLocation && driverLocation.latitude != null && driverLocation.longitude != null && (
            <Marker
              coordinate={driverLocation}
              title="Driver"
              pinColor="#3b82f6"
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text>Loading map...</Text>
          <Text style={{ marginTop: 10, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20 }}>
            {!pickupCoords || !dropoffCoords ? 'Location data is missing. Please check your trip details.' : 'Unable to display map. Please enable location services.'}
          </Text>
        </View>
      )}

      {/* Driver Info Card */}
      <View style={styles.driverInfoCard}>
        <View style={styles.driverInfoHeader}>
          <Text style={styles.driverInfoName}>{driverName || 'Driver'}</Text>
          <Text style={styles.driverInfoVehicle}>{vehicleInfo || 'Vehicle Info'}</Text>
          <Text style={styles.driverInfoPrice}>PKR {acceptedPrice || '0'}</Text>
        </View>

        <View style={styles.routeInfo}>
          <View style={styles.routePoint}>
            <View style={styles.routePointIndicator} />
            <Text style={styles.routeText}>{pickupAddress || 'Pickup Location'}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routePointIndicator, styles.routePointIndicatorEnd]} />
            <Text style={styles.routeText}>{dropoffAddress || 'Dropoff Location'}</Text>
          </View>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleChat}>
            <Text style={styles.actionButtonText}>💬 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
            <Text style={styles.actionButtonText}>📞 Call</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.sosButton, sosLoading && styles.actionButtonDisabled]} 
            onPress={handleSOS}
            disabled={sosLoading}
          >
            {sosLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.actionButtonText, styles.sosButtonText]}>SOS</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, isShared ? styles.shareButtonShared : styles.shareButton, shareLoading && styles.actionButtonDisabled]} 
            onPress={handleShareTrip}
            disabled={shareLoading || isShared}
          >
            {shareLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>{isShared ? '📤 Shared ✓' : '📤 Share'}</Text>
            )}
          </TouchableOpacity>
          {(tripStatus === 'accepted' || tripStatus === 'in_progress') && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.cancelTripButton, cancelling && styles.actionButtonDisabled]} 
              onPress={handleCancelTrip}
              disabled={cancelling || tripStatus === 'completed'}
            >
              {cancelling ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.actionButtonText}>🚫 Cancel</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ========================================
// SCREEN 6: EMERGENCY CONTACTS SCREEN
// ========================================
function EmergencyContactsScreen({ navigation }) {
  const [emergencyContact, setEmergencyContact] = useState('');
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/me');
      const user = response.data;
      setEmergencyContact(user.emergencyContact || '');
      setTrustedContacts(user.trustedContacts || []);
      
      // Also save to local storage for caching
      await setEmergencyContacts(user.emergencyContact || '', user.trustedContacts || []);
    } catch (error) {
      console.error('Load Contacts Error:', error);
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const saveContacts = async () => {
    // Validate emergency contact phone number
    if (emergencyContact) {
      // Normalize phone number: remove non-digit characters except leading '+'
      const normalized = emergencyContact.startsWith('+') 
        ? '+' + emergencyContact.slice(1).replace(/\D/g, '')
        : emergencyContact.replace(/\D/g, '');
      
      // Count digits (excluding the leading '+')
      const digitsOnly = normalized.startsWith('+') ? normalized.slice(1) : normalized;
      const digitCount = digitsOnly.length;
      
      if (!normalized.startsWith('+') || digitCount < 10 || digitCount > 15) {
        Alert.alert('Invalid Phone Number', 'Emergency contact must be a valid phone number starting with + and having 10-15 digits');
        return;
      }
    }

    setSaving(true);
    try {
      const response = await api.put('/me', {
        emergencyContact: emergencyContact || null,
        trustedContacts: trustedContacts
      });

      // Save to local storage
      await setEmergencyContacts(emergencyContact || null, trustedContacts);

      Alert.alert('Contacts Saved', 'Your emergency contacts have been updated');
    } catch (error) {
      console.error('Save Contacts Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to save contacts');
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const addTrustedContact = () => {
    if (!newContactName || !newContactPhone) {
      Alert.alert('Error', 'Please enter both name and phone number');
      return;
    }

    // Validate phone number
    // Normalize phone number: remove non-digit characters except leading '+'
    const normalized = newContactPhone.startsWith('+') 
      ? '+' + newContactPhone.slice(1).replace(/\D/g, '')
      : newContactPhone.replace(/\D/g, '');
    
    // Count digits (excluding the leading '+')
    const digitsOnly = normalized.startsWith('+') ? normalized.slice(1) : normalized;
    const digitCount = digitsOnly.length;
    
    if (!normalized.startsWith('+') || digitCount < 10 || digitCount > 15) {
      Alert.alert('Invalid Phone Number', 'Phone number must start with + and have 10-15 digits');
      return;
    }

    const newContact = {
      id: Date.now().toString(),
      name: newContactName,
      phone: newContactPhone
    };

    setTrustedContacts([...trustedContacts, newContact]);
    setNewContactName('');
    setNewContactPhone('');
    setShowAddDialog(false);
  };

  const removeTrustedContact = (contactId) => {
    Alert.alert(
      'Remove Contact',
      'Remove this contact?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setTrustedContacts(trustedContacts.filter(c => c.id !== contactId));
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 50 }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.emergencyContactsContainer}>
      <Text style={styles.pageTitle}>Emergency Contacts</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Add emergency contacts who will be notified during SOS alerts and can track your trips.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Primary Emergency Contact</Text>
      <Text style={styles.helperText}>This contact will be notified during emergencies</Text>
      <Text style={styles.helperText}>Local formats like 0300 1234567 are supported.</Text>
      <TextInput
        style={styles.input}
        placeholder="0300 1234567 or +92 300 1234567"
        value={emergencyContact}
        onChangeText={setEmergencyContact}
        keyboardType="phone-pad"
      />

      <Text style={styles.sectionLabel}>Trusted Contacts</Text>
      <Text style={styles.helperText}>These contacts can track your trips when shared</Text>

      {trustedContacts.length === 0 ? (
        <Text style={styles.emptyContactsText}>No trusted contacts added</Text>
      ) : (
        trustedContacts.map((contact) => (
          <View key={contact.id} style={styles.contactCard}>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>{contact.phone}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => removeTrustedContact(contact.id)}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity
        style={styles.addContactButton}
        onPress={() => setShowAddDialog(true)}
      >
        <Text style={styles.addContactButtonText}>+ Add Trusted Contact</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={saveContacts}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save Contacts</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={showAddDialog}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Trusted Contact</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              value={newContactName}
              onChangeText={setNewContactName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Phone Number"
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowAddDialog(false)}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextCancel]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonAdd]}
                onPress={addTrustedContact}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextAdd]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ========================================
// SCREEN 5: DRIVER DASHBOARD
// ========================================
function DriverDashboardScreen({ navigation }) {
  const [isOnline, setIsOnline] = useState(false);
  const [trips, setTrips] = useState([]);
  const [userData, setUserData] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [driverData, setDriverData] = useState(null);
  const [driverStatus, setDriverStatus] = useState(null); // null, 'not_registered', 'pending', 'verified', 'rejected'
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVerificationSuccess, setShowVerificationSuccess] = useState(false);
  const previousDriverStatusRef = useRef(null);
  const successBannerTimeoutRef = useRef(null);

  useEffect(() => {
    checkRoleAndLoad();
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      checkDriverRegistrationStatus();
    }
  }, [isAuthorized]);

  // Ensure driver is forced Offline if verification changes to non-verified mid-session
  useEffect(() => {
    if (driverStatus !== 'verified' && isOnline) {
      setIsOnline(false);
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('driver_status', { online: false });
      }
      // Show alert informing the driver that Online mode was disabled due to verification status change
      Alert.alert(
        'Online Mode Disabled',
        'Your online mode has been disabled due to a change in your verification status. Please contact support if you have any questions.'
      );
    }
  }, [driverStatus]);

  useEffect(() => {
    const previousStatus = previousDriverStatusRef.current;
    if (
      (previousStatus === 'pending' || previousStatus === 'not_registered') &&
      driverStatus === 'verified'
    ) {
      setShowVerificationSuccess(true);
      if (successBannerTimeoutRef.current) {
        clearTimeout(successBannerTimeoutRef.current);
      }
      successBannerTimeoutRef.current = setTimeout(() => {
        setShowVerificationSuccess(false);
        successBannerTimeoutRef.current = null;
      }, 5000);
    }
    previousDriverStatusRef.current = driverStatus;
  }, [driverStatus]);

  useEffect(() => {
    return () => {
      if (successBannerTimeoutRef.current) {
        clearTimeout(successBannerTimeoutRef.current);
        successBannerTimeoutRef.current = null;
      }
    };
  }, []);

  const checkRoleAndLoad = async () => {
    const userData = await getUserDataStorage();
    if (!userData || (userData.role !== 'driver' && userData.role !== 'admin')) {
      Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
        { text: 'OK', onPress: () => navigation.replace('Main') }
      ]);
      return;
    }
    setIsAuthorized(true);
    setUserData(userData);
    loadUserData();
    checkActiveTrip();
  };

  const checkDriverRegistrationStatus = async () => {
    try {
      setStatusLoading(true);
      // Read cached driver data first for quick display
      const cachedDriverData = await getDriverDataFromStorage();
      if (cachedDriverData) {
        setDriverData(cachedDriverData);
        const status = cachedDriverData.verificationStatus || cachedDriverData.verification_status || 'pending';
        setDriverStatus(status);
      }
      
      // Then fetch latest data from server
      const response = await api.get('/me');
      const userData = response.data;
      
      if (!userData.driver) {
        setDriverStatus('not_registered');
        setDriverData(null);
      } else {
        setDriverData(userData.driver);
        const status = userData.driver.verificationStatus || userData.driver.verification_status || 'pending';
        setDriverStatus(status);
        // Update cached driver data
        await setDriverDataToStorage(userData.driver);
      }
    } catch (error) {
      console.error('Error checking driver registration status:', error);
      // Fail silently - don't block the UI
    } finally {
      setStatusLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    
    const socket = getSocket();
    if (socket) {
      socket.on('new_trip', (trip) => {
        setTrips((prev) => [...prev, trip]);
        showToast(`New Trip! From ${trip.pickup_address} to ${trip.drop_address}`, { throttle: true });
      });

      // Listen for offer_accepted event
      const handleOfferAccepted = (data) => {
        setActiveTrip({
          id: data.trip_id,
          passenger_name: data.passenger_name,
          pickup_address: data.pickup_address,
          dropoff_address: data.drop_address,
          accepted_price: data.accepted_price,
          pickup_coords: data.pickup_coords,
          dropoff_coords: data.dropoff_coords
        });
        
        showToast('Your offer was accepted!', { throttle: true });
        // Navigate after a short delay to allow toast to be seen
        setTimeout(() => {
          navigation.navigate('DriverActiveTrip', {
            tripId: data.trip_id,
            passengerId: data.passenger_id,
            passengerName: data.passenger_name,
            pickupAddress: data.pickup_address,
            dropoffAddress: data.drop_address,
            acceptedPrice: data.accepted_price,
            pickupCoords: data.pickup_coords,
            dropoffCoords: data.dropoff_coords
          });
        }, 1000);
      };

      socket.on('offer_accepted', handleOfferAccepted);

      return () => {
        socket.off('new_trip');
        socket.off('offer_accepted', handleOfferAccepted);
      };
    }
  }, [isAuthorized]);

  if (!isAuthorized) {
    return null;
  }

  const loadUserData = async () => {
    const data = await getUserDataStorage();
    if (data) setUserData(data);
  };

  const checkActiveTrip = async () => {
    try {
      const user = await getUserDataStorage();
      if (!user) return;
      const response = await api.get('/trips');
      const allTrips = response.data || [];
      
      // Filter trips where driver is assigned and status is 'accepted' or 'in_progress'
      const active = allTrips.find(trip => 
        trip.driver_id === user.id && 
        (trip.status === 'accepted' || trip.status === 'in_progress')
      );
      
      if (active) {
        setActiveTrip({
          id: active.id || active.trip_id,
          passenger_name: active.passenger_name,
          pickup_address: active.pickup_address,
          dropoff_address: active.drop_address,
          accepted_price: active.accepted_price,
          status: active.status,
          pickup_coords: active.pickup_lat && active.pickup_lng ? {
            latitude: active.pickup_lat,
            longitude: active.pickup_lng
          } : null,
          dropoff_coords: active.drop_lat && active.drop_lng ? {
            latitude: active.drop_lat,
            longitude: active.drop_lng
          } : null
        });
      }
    } catch (error) {
      console.error('Check active trip error:', error);
      // Fail silently - don't show error if check fails
    }
  };

  const handleDismissSuccessBanner = () => {
    if (successBannerTimeoutRef.current) {
      clearTimeout(successBannerTimeoutRef.current);
      successBannerTimeoutRef.current = null;
    }
    setShowVerificationSuccess(false);
  };

  const toggleOnline = async () => {
    // Block toggle while status is loading to avoid relying on stale cached verification
    if (statusLoading) {
      return;
    }
    
    // Prevent going online if not verified
    if (driverStatus !== 'verified') {
      if (driverStatus === 'not_registered') {
        Alert.alert(
          'Registration Required',
          'Please complete your driver registration before going online.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Complete Registration', onPress: () => navigation.navigate('DriverRegistration') }
          ]
        );
      } else if (driverStatus === 'pending') {
        Alert.alert(
          'Verification Pending',
          'Your registration is pending admin verification. You cannot go online yet.'
        );
      } else if (driverStatus === 'rejected') {
        Alert.alert(
          'Registration Rejected',
          'Your registration was rejected. Please contact support for assistance.'
        );
      }
      return;
    }

    const newOnlineState = !isOnline;
    
    // Ensure socket is connected
    let socket = getSocket();
    if (!socket || !socket.connected) {
      const token = await getAuthToken();
      if (token) {
        socket = await connectSocket(token);
      }
    }
    
    if (!socket || !socket.connected) {
      Alert.alert('Connection Error', 'Unable to connect to server. Please check your internet connection.');
      return;
    }
    
    // Emit with acknowledgement
    socket.emit('driver_status', { online: newOnlineState }, (response) => {
      if (response && response.error) {
        Alert.alert('Error', response.error);
        // Revert state on error
        setIsOnline(isOnline);
      } else {
        // Update state on success
        setIsOnline(newOnlineState);
      }
    });
    
    // Optimistically update UI (will revert if ack fails)
    setIsOnline(newOnlineState);
  };

  const makeOffer = async (tripId) => {
    navigation.navigate('MakeOffer', { tripId });
  };

  const navigateToActiveTrip = () => {
    if (!activeTrip) return;
    
    navigation.navigate('DriverActiveTrip', {
      tripId: activeTrip.id,
      passengerName: activeTrip.passenger_name,
      pickupAddress: activeTrip.pickup_address,
      dropoffAddress: activeTrip.dropoff_address,
      acceptedPrice: activeTrip.accepted_price,
      pickupCoords: activeTrip.pickup_coords,
      dropoffCoords: activeTrip.dropoff_coords
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkDriverRegistrationStatus();
  };

  const getStatusBadge = () => {
    if (statusLoading) {
      return (
        <View style={styles.verificationBadge}>
          <ActivityIndicator size="small" color="#6b7280" />
        </View>
      );
    }

    if (driverStatus === 'pending') {
      return (
        <View style={[styles.verificationBadge, styles.verificationBadgePending]}>
          <Text style={[styles.verificationBadgeText, styles.verificationBadgeTextPending]}>⏳ Pending Verification</Text>
        </View>
      );
    }

    if (driverStatus === 'verified') {
      return (
        <View style={[styles.verificationBadge, styles.verificationBadgeVerified]}>
          <Text style={[styles.verificationBadgeText, styles.verificationBadgeTextVerified]}>✓ Verified</Text>
        </View>
      );
    }

    if (driverStatus === 'rejected') {
      return (
        <View style={[styles.verificationBadge, styles.verificationBadgeRejected]}>
          <Text style={[styles.verificationBadgeText, styles.verificationBadgeTextRejected]}>✗ Rejected</Text>
        </View>
      );
    }

    if (driverStatus === 'not_registered') {
      return (
        <View style={[styles.verificationBadge, styles.verificationBadgeNotRegistered]}>
          <Text style={[styles.verificationBadgeText, styles.verificationBadgeTextNotRegistered]}>⚠ Registration Required</Text>
        </View>
      );
    }

    return null;
  };

  const getButtonHelperText = () => {
    if (driverStatus === 'verified') return null;
    if (driverStatus === 'not_registered') return 'Complete registration first';
    if (driverStatus === 'pending') return 'Awaiting verification';
    if (driverStatus === 'rejected') return 'Contact support';
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.driverHeader}>
        <View style={styles.driverHeaderTop}>
          <Text style={styles.pageTitle}>Driver Dashboard</Text>
          {getStatusBadge()}
        </View>
        <View style={styles.driverHeaderButton}>
          <TouchableOpacity
            style={[
              styles.statusBtn,
              isOnline && styles.statusBtnOnline,
              (driverStatus !== 'verified' || statusLoading) && styles.statusBtnDisabled
            ]}
            onPress={toggleOnline}
            disabled={driverStatus !== 'verified' || statusLoading}
          >
            <Text style={styles.statusBtnText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </TouchableOpacity>
          {getButtonHelperText() && (
            <Text style={styles.buttonHelperText}>{getButtonHelperText()}</Text>
          )}
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      >
        {showVerificationSuccess && (
          <View style={[styles.registrationBanner, styles.registrationBannerSuccess]}>
            <View style={styles.successBannerTopRow}>
              <Text style={[styles.bannerIcon, styles.successBannerIcon]}>✅</Text>
              <TouchableOpacity
                style={styles.bannerCloseButton}
                onPress={handleDismissSuccessBanner}
                accessibilityRole="button"
                accessibilityLabel="Dismiss verification success message"
              >
                <Text style={styles.bannerCloseButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.bannerTitle, styles.bannerTitleSuccess]}>Verification Complete</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageSuccess]}>
              You can now go online and start accepting trip requests.
            </Text>
          </View>
        )}

        {/* Driver Registration Status Banners */}
        {driverStatus === 'not_registered' && (
          <View style={[styles.registrationBanner, styles.registrationBannerNotRegistered]}>
            <Text style={styles.bannerIcon}>⚠️</Text>
            <Text style={[styles.bannerTitle, styles.bannerTitleNotRegistered]}>Complete Driver Registration</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageNotRegistered]}>You need to complete your driver registration before you can start receiving trips.</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageNotRegistered]}>Required: License Number, Vehicle Details, License Photo, Vehicle Photo, CNIC Photo</Text>
            <TouchableOpacity
              style={styles.registrationButton}
              onPress={() => navigation.navigate('DriverRegistration')}
            >
              <Text style={styles.registrationButtonText}>Complete Registration</Text>
            </TouchableOpacity>
          </View>
        )}

        {driverStatus === 'pending' && (
          <View style={[styles.registrationBanner, styles.registrationBannerPending]}>
            <Text style={styles.bannerIcon}>⏳</Text>
            <Text style={[styles.bannerTitle, styles.bannerTitlePending]}>Verification In Progress</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessagePending]}>Your profile is under review. You'll be notified once verified.</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessagePending]}>This usually takes 24-48 hours. You cannot go online until verification is complete.</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessagePending]}>Make sure your documents are clear and readable to speed up the process.</Text>
          </View>
        )}

        {driverStatus === 'rejected' && (
          <View style={[styles.registrationBanner, styles.registrationBannerRejected]}>
            <Text style={styles.bannerIcon}>✗</Text>
            <Text style={[styles.bannerTitle, styles.bannerTitleRejected]}>Registration Rejected</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageRejected]}>Your registration was rejected. Please contact support for assistance.</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageRejected]}>Common reasons: Unclear documents, invalid license, vehicle not eligible</Text>
            <Text style={[styles.bannerMessage, styles.bannerMessageRejected]}>Support: {config.SUPPORT_EMAIL} | Phone: {config.SUPPORT_PHONE}</Text>
            <TouchableOpacity
              style={styles.registrationButton}
              onPress={() => {
                Linking.openURL(`mailto:${config.SUPPORT_EMAIL}?subject=Driver Registration Rejected`);
              }}
            >
              <Text style={styles.registrationButtonText}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active Trip Banner */}
        {activeTrip && (
          <View style={styles.activeTripBanner}>
            <Text style={styles.activeTripBannerText}>You have an active trip!</Text>
            <Text style={styles.activeTripBannerDetails}>
              {activeTrip.passenger_name} • {activeTrip.pickup_address} → {activeTrip.dropoff_address}
            </Text>
            <TouchableOpacity
              style={styles.viewActiveTripButton}
              onPress={navigateToActiveTrip}
            >
              <Text style={styles.viewActiveTripButtonText}>View Active Trip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hide available trips when active trip exists */}
        {activeTrip ? (
          <View style={styles.emptyState}>
            <Text style={styles.hint}>Complete your current trip before accepting new trips</Text>
          </View>
        ) : trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Text>No trips available</Text>
            <Text style={styles.hint}>Turn online to receive trip requests</Text>
          </View>
        ) : (
          trips.map((trip, idx) => (
            <View key={idx} style={styles.tripCard}>
              <Text style={styles.tripRoute}>{trip.pickup_address}</Text>
              <Text style={styles.tripArrow}>↓</Text>
              <Text style={styles.tripRoute}>{trip.drop_address}</Text>
              <Text style={styles.tripPrice}>Proposed: PKR {trip.proposed_price}</Text>
              <TouchableOpacity
                style={styles.offerButton}
                onPress={() => makeOffer(trip.trip_id)}
              >
                <Text style={styles.offerButtonText}>Make Offer</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ========================================
// SCREEN 6: MAKE OFFER (DRIVER)
// ========================================
function MakeOfferScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [price, setPrice] = useState('');
  const [eta, setEta] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkRole();
  }, []);

  const checkRole = async () => {
    const userData = await getUserDataStorage();
    if (!userData || (userData.role !== 'driver' && userData.role !== 'admin')) {
      Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
        { text: 'OK', onPress: () => navigation.replace('Main') }
      ]);
      return;
    }
    setIsAuthorized(true);
  };

  if (!isAuthorized) {
    return null;
  }

  const submitOffer = async () => {
    if (!price || !eta) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    // Validate price
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum > 100000) {
      Alert.alert('Error', 'Please enter a valid price between 1 and 100,000 PKR');
      return;
    }

    // Validate ETA
    const etaNum = parseInt(eta);
    if (isNaN(etaNum) || etaNum <= 0 || etaNum > 300) {
      Alert.alert('Error', 'Please enter a valid ETA between 1 and 300 minutes');
      return;
    }

    setLoading(true);
    try {
      await retryWithBackoff(async () => {
        return await api.post(`/trips/${tripId}/offers`, {
          price_offer: priceNum,
          eta_minutes: etaNum,
        });
      });
      Alert.alert('Success', 'Offer sent!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Submit Offer Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to submit offer');
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Make Your Offer</Text>
      <TextInput
        style={styles.input}
        placeholder="Your Price (PKR)"
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="ETA (minutes)"
        value={eta}
        onChangeText={setEta}
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.button} onPress={submitOffer} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Offer'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ========================================
// SCREEN 6.5: DRIVER ACTIVE TRIP SCREEN
// ========================================
function DriverActiveTripScreen({ route, navigation }) {
  const { 
    tripId, 
    passengerId, 
    passengerName, 
    pickupAddress, 
    dropoffAddress, 
    pickupCoords, 
    dropoffCoords, 
    acceptedPrice 
  } = route.params || {};

  const [tripStatus, setTripStatus] = useState('accepted');
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [completingTrip, setCompletingTrip] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  const locationInterval = useRef(null);
  const isMounted = useRef(true);
  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const checkRoleAndLoad = async () => {
    const userData = await getUserDataStorage();
    if (!userData || (userData.role !== 'driver' && userData.role !== 'admin')) {
      Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
        { text: 'OK', onPress: () => navigation.replace('Main') }
      ]);
      return;
    }
    setIsAuthorized(true);
    
    if (!tripId) {
      Alert.alert('Error', 'Trip ID is required', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
      return;
    }

    loadTripDetails();
    setupSocketListeners();
  };

  useEffect(() => {
    isMounted.current = true;
    checkRoleAndLoad();

    return () => {
      isMounted.current = false;
      // Call async stopLocationTracking (fire and forget in cleanup)
      stopLocationTracking().catch(err => console.error('Error stopping location tracking:', err));
      if (socketRef.current) {
        socketRef.current.off('trip_started');
        socketRef.current.off('trip_completed');
        // Leave trip room using socketManager
        if (tripId) {
          socketManager.leaveTrip(tripId);
        }
      }
    };
  }, [tripId]);

  if (!isAuthorized) {
    return null;
  }

  useEffect(() => {
    if (tripStatus === 'in_progress') {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
  }, [tripStatus]);

  const loadTripDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/trips/${tripId}`);
      const trip = response.data;
      
      // Extract trip data
      const extractedData = {
        passenger_name: trip.passenger_name || passengerName || 'Passenger',
        pickup_address: trip.pickup_address || pickupAddress || '',
        drop_address: trip.drop_address || dropoffAddress || '',
        pickup_lat: trip.pickup_lat || (pickupCoords?.latitude),
        pickup_lng: trip.pickup_lng || (pickupCoords?.longitude),
        drop_lat: trip.drop_lat || (dropoffCoords?.latitude),
        drop_lng: trip.drop_lng || (dropoffCoords?.longitude),
        accepted_price: trip.accepted_price || acceptedPrice || trip.proposed_price || 0,
        status: trip.status || 'accepted'
      };

      // Validate driver is assigned to trip
      const user = await getUserDataStorage();
      if (user) {
        if (trip.driver_id && trip.driver_id !== user.id) {
          Alert.alert('Unauthorized', 'You are not assigned to this trip', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
          return;
        }
      }

      setTripData(extractedData);
      setTripStatus(extractedData.status);
    } catch (error) {
      console.error('Load Trip Details Error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to load trip details');
      setError(errorMessage);
      Alert.alert('Error', errorMessage, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const setupSocketListeners = async () => {
    let socket = getSocket();
    if (!socket) {
      const token = await getAuthToken();
      if (token) {
        await connectSocket(token);
        socket = getSocket();
      }
    }

    // Wait for socket to be connected if it exists
    if (socket && !socket.connected) {
      await new Promise((resolve) => {
        if (socket.connected) {
          resolve();
        } else {
          const timeout = setTimeout(resolve, 5000);
          socket.once('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
        }
      });
    }

    // Re-read socket after potential connection
    socket = getSocket();
    
    if (!socket || !socket.connected) {
      console.warn('Socket not available or not connected for DriverActiveTripScreen');
      // Register a one-time handler on the socket's connect event as fallback
      if (socket && !socket.connected) {
        socket.once('connect', () => {
          socketRef.current = socket;
          socketManager.joinTrip(tripId);
          // Attach listeners after connection
          attachSocketListeners(socket);
        });
      }
      return;
    }

    socketRef.current = socket;
    
    // Join trip room using socketManager
    socketManager.joinTrip(tripId);
    
    // Attach listeners
    attachSocketListeners(socket);
  };

  const attachSocketListeners = (socket) => {
    if (!socket) return;
    
    // Listen for trip_started
    const handleTripStarted = (data) => {
      if (!isMounted.current) return;
      if (data.trip_id === tripId) {
        setTripStatus('in_progress');
        Alert.alert('Trip Started', 'Trip has been started');
      }
    };

    // Listen for trip_completed
    const handleTripCompleted = (data) => {
      if (!isMounted.current) return;
      if (data.trip_id === tripId) {
        setTripStatus('completed');
        stopLocationTracking();
        Alert.alert('Trip Completed', 'Trip completed! Navigate to home.', [
          { 
            text: 'OK', 
            onPress: () => {
              setTimeout(() => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Main' }]
                });
              }, 2000);
            }
          }
        ]);
      }
    };

    socket.on('trip_started', handleTripStarted);
    socket.on('trip_completed', handleTripCompleted);

    return () => {
      if (socket) {
        socket.off('trip_started', handleTripStarted);
        socket.off('trip_completed', handleTripCompleted);
      }
    };
  };

  const startLocationTracking = async () => {
    try {
      // Request foreground location permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Please enable location access in settings to track your trip.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      // Request background location permissions
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background Location Permission Required',
          'Please enable background location access in settings to track your trip when the app is in the background.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        // Continue with foreground tracking even if background is denied
      }

      // Store tripId for background task (normalize to string)
      await AsyncStorage.setItem('currentTripId', normalizeTripId(tripId));

      // Get initial location
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      
      if (isMounted.current) {
        const coords = {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude
        };
        setCurrentLocation(coords);
        
        // Emit initial location
        const socket = getSocket();
        if (socket) {
          socket.emit('location_update', {
            tripId: tripId,
            lat: coords.latitude,
            lng: coords.longitude
          });
        }
      }

      // Check if location updates are already running before starting
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!isRunning) {
        // Start background location updates with optimized intervals
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000, // Increased from 5s to 15s for better battery life
          distanceInterval: 30, // Increased from 10m to 30m
          foregroundService: {
            notificationTitle: 'SafeRide Location Tracking',
            notificationBody: 'Tracking your location for the active trip',
          },
        });
      }

      // Only start foreground polling if background updates are not running
      const backgroundRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!backgroundRunning) {
        // Start foreground polling for map updates (fallback when background denied)
        locationInterval.current = setInterval(async () => {
          if (!isMounted.current) return;
          
          try {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            });
            
            if (isMounted.current) {
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
              setCurrentLocation(coords);
              
              // Animate map to current location
              if (mapRef.current) {
                mapRef.current.animateToRegion({
                  ...coords,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01
                }, 1000);
              }
            }
          } catch (error) {
            console.error('Location update error:', error);
            // Continue interval even if one update fails
          }
        }, 15000); // Increased from 5s to 15s for better battery life
      }
    } catch (error) {
      console.error('Start location tracking error:', error);
      Alert.alert('Error', 'Failed to start location tracking');
    }
  };

  const stopLocationTracking = async () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
    
    // Stop background location updates
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (error) {
      console.error('Error stopping location updates:', error);
    }
    
    // Remove tripId from storage
    await AsyncStorage.removeItem('currentTripId');
  };

  const handleStartTrip = async () => {
    // Request location permissions first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'Location permission is required to start the trip. Please enable location access in settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    // Request background permissions if implementing background tracking
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      Alert.alert(
        'Background Location Permission',
        'Background location permission is recommended for better trip tracking. You can enable it later in settings.',
        [
          { text: 'Continue Anyway', style: 'default' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
    }

    Alert.alert(
      'Start Trip',
      'Start trip to pickup passenger?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Trip',
          onPress: async () => {
            setStartingTrip(true);
            try {
              await retryWithBackoff(async () => {
                return await api.post(`/trips/${tripId}/start`);
              });
              
              if (isMounted.current) {
                setTripStatus('in_progress');
                Alert.alert('Success', 'Trip started! Navigate to pickup location.');
              }
            } catch (error) {
              console.error('Start Trip Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to start trip');
              Alert.alert('Error', errorMessage);
            } finally {
              if (isMounted.current) {
                setStartingTrip(false);
              }
            }
          }
        }
      ]
    );
  };

  const handleCompleteTrip = async () => {
    Alert.alert(
      'Complete Trip',
      'Mark trip as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Trip',
          onPress: async () => {
            setCompletingTrip(true);
            try {
              await retryWithBackoff(async () => {
                return await api.post(`/trips/${tripId}/complete`);
              });
              
              if (isMounted.current) {
                setTripStatus('completed');
                stopLocationTracking();
                Alert.alert('Success', 'Trip completed! Thank you for driving safely.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      setTimeout(() => {
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Main' }]
                        });
                      }, 2000);
                    }
                  }
                ]);
              }
            } catch (error) {
              console.error('Complete Trip Error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to complete trip');
              Alert.alert('Error', errorMessage);
            } finally {
              if (isMounted.current) {
                setCompletingTrip(false);
              }
            }
          }
        }
      ]
    );
  };

  const handleNavigate = async () => {
    if (!tripData) return;
    
    const destination = tripStatus === 'in_progress' 
      ? { lat: tripData.drop_lat, lng: tripData.drop_lng }
      : { lat: tripData.pickup_lat, lng: tripData.pickup_lng };
    
    let url;
    
    if (Platform.OS === 'ios') {
      // Try Apple Maps first on iOS
      const appleMapsUrl = `http://maps.apple.com/?daddr=${destination.lat},${destination.lng}`;
      const canOpenAppleMaps = await Linking.canOpenURL(appleMapsUrl);
      
      if (canOpenAppleMaps) {
        url = appleMapsUrl;
      } else {
        // Fallback to Google Maps
        url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
      }
    } else {
      // Android - use Google Maps
      url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
    }
    
    Linking.openURL(url).catch(err => {
      console.error('Failed to open maps:', err);
      Alert.alert('Error', 'Failed to open maps app');
    });
  };

  // Calculate map region
  const mapRegion = useMemo(() => {
    if (!tripData) return null;
    
    const points = [
      { latitude: tripData.pickup_lat, longitude: tripData.pickup_lng },
      { latitude: tripData.drop_lat, longitude: tripData.drop_lng }
    ];
    
    if (currentLocation) {
      points.push(currentLocation);
    }
    
    const lats = points.map(p => p.latitude).filter(Boolean);
    const lngs = points.map(p => p.longitude).filter(Boolean);
    
    if (lats.length === 0) return null;
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.01),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.01)
    };
  }, [tripData, currentLocation]);

  if (loading && !tripData) {
    return (
      <View style={styles.driverActiveTripContainer}>
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 50 }} />
      </View>
    );
  }

  if (error && !tripData) {
    return (
      <View style={styles.driverActiveTripContainer}>
        <Text style={{ color: '#ef4444', textAlign: 'center', margin: 20 }}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={loadTripDetails}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!tripData) {
    return null;
  }

  const getStatusBarStyle = () => {
    switch (tripStatus) {
      case 'accepted':
        return styles.driverStatusBar;
      case 'in_progress':
        return [styles.driverStatusBar, styles.driverStatusBarInProgress];
      case 'completed':
        return [styles.driverStatusBar, styles.driverStatusBarCompleted];
      default:
        return styles.driverStatusBar;
    }
  };

  const getStatusText = () => {
    switch (tripStatus) {
      case 'accepted':
        return { title: 'Ready to Start', subtitle: 'Tap Start Trip when ready' };
      case 'in_progress':
        return { title: 'Trip in Progress', subtitle: 'Navigate to destination' };
      case 'completed':
        return { title: 'Trip Completed', subtitle: 'Thank you for driving!' };
      default:
        return { title: 'Active Trip', subtitle: '' };
    }
  };

  const statusInfo = getStatusText();
  const passengerInitial = (tripData.passenger_name || 'P').charAt(0).toUpperCase();

  return (
    <View style={styles.driverActiveTripContainer}>
      {/* Status Bar */}
      <View style={getStatusBarStyle()}>
        <Text style={styles.driverStatusText}>{statusInfo.title}</Text>
        <Text style={styles.driverStatusSubtext}>{statusInfo.subtitle}</Text>
      </View>

      {/* Map */}
      {mapRegion && tripData && tripData.pickup_lat != null && tripData.pickup_lng != null && tripData.drop_lat != null && tripData.drop_lng != null ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.driverMapContainer}
          initialRegion={mapRegion}
          showsUserLocation={false}
        >
          {/* Pickup Marker */}
          {tripData.pickup_lat != null && tripData.pickup_lng != null && (
            <Marker
              coordinate={{ latitude: tripData.pickup_lat, longitude: tripData.pickup_lng }}
              title="Pickup"
              description={tripData.pickup_address}
              pinColor="#10b981"
            />
          )}
          
          {/* Dropoff Marker */}
          {tripData.drop_lat != null && tripData.drop_lng != null && (
            <Marker
              coordinate={{ latitude: tripData.drop_lat, longitude: tripData.drop_lng }}
              title="Drop-off"
              description={tripData.drop_address}
              pinColor="#ef4444"
            />
          )}
          
          {/* Driver Current Location Marker */}
          {currentLocation && currentLocation.latitude != null && currentLocation.longitude != null && (
            <Marker
              coordinate={currentLocation}
              title="You"
              pinColor="#ec4899"
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text>Loading map...</Text>
          <Text style={{ marginTop: 10, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20 }}>
            {!tripData || !tripData.pickup_lat || !tripData.drop_lat ? 'Location data is missing. Please check your trip details.' : 'Unable to display map. Please enable location services.'}
          </Text>
        </View>
      )}

      {/* Passenger Info Card */}
      <View style={styles.passengerInfoCard}>
        <View style={styles.passengerInfoHeader}>
          <View style={styles.passengerAvatar}>
            <Text style={styles.passengerAvatarText}>{passengerInitial}</Text>
          </View>
          <View style={styles.passengerDetails}>
            <Text style={styles.passengerName}>{tripData.passenger_name}</Text>
            <Text style={styles.tripRouteText}>{tripData.pickup_address}</Text>
            <Text style={styles.tripRouteText}>→ {tripData.drop_address}</Text>
            <Text style={styles.tripPriceText}>PKR {tripData.accepted_price}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        {tripStatus === 'accepted' && (
          <TouchableOpacity
            style={styles.startTripButton}
            onPress={handleStartTrip}
            disabled={startingTrip}
          >
            {startingTrip ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startTripButtonText}>Start Trip</Text>
            )}
          </TouchableOpacity>
        )}

        {tripStatus === 'in_progress' && (
          <View style={styles.tripActionsRow}>
            <TouchableOpacity
              style={styles.navigateButton}
              onPress={handleNavigate}
            >
              <Text style={styles.actionButtonText}>Navigate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.completeTripButton}
              onPress={handleCompleteTrip}
              disabled={completingTrip}
            >
              {completingTrip ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Complete Trip</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {tripStatus === 'completed' && (
          <View style={styles.completedContainer}>
            <Text style={styles.completedIcon}>✓</Text>
            <Text style={styles.completedText}>Trip completed successfully!</Text>
            <Text style={styles.completedSubtext}>Returning to dashboard...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ========================================
// SHARED HELPER FUNCTIONS
// ========================================
const statusBadgeStyle = (status) => {
  switch (status) {
    case 'completed':
      return [styles.statusBadge, styles.statusBadgeCompleted];
    case 'in_progress':
      return [styles.statusBadge, styles.statusBadgeInProgress];
    case 'accepted':
      return [styles.statusBadge, styles.statusBadgeAccepted];
    case 'requested':
      return [styles.statusBadge, styles.statusBadgeRequested];
    case 'cancelled':
      return [styles.statusBadge, styles.statusBadgeCancelled];
    default:
      return [styles.statusBadge, styles.statusBadgeRequested];
  }
};

const statusTextStyle = (status) => {
  switch (status) {
    case 'completed':
      return styles.statusTextCompleted;
    case 'in_progress':
      return styles.statusTextInProgress;
    case 'accepted':
      return styles.statusTextAccepted;
    case 'requested':
      return styles.statusTextRequested;
    case 'cancelled':
      return styles.statusTextCancelled;
    default:
      return styles.statusTextRequested;
  }
};

// ========================================
// SCREEN 7: TRIPS HISTORY
// ========================================
function TripsHistoryScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [userRole, setUserRole] = useState('passenger');

  useEffect(() => {
    loadUserRole();
    fetchTrips();
  }, []);

  const loadUserRole = async () => {
    const user = await getUserDataStorage();
    if (user) {
      setUserRole(user.role);
    }
  };

  const fetchTrips = async () => {
    try {
      const response = await api.get('/trips');
      const tripsData = Array.isArray(response.data) ? response.data : (Array.isArray(response.data?.trips) ? response.data.trips : []);
      
      // Sort trips by created_at descending (most recent first)
      const sortedTrips = Array.isArray(tripsData) 
        ? tripsData.sort((a, b) => {
            const dateA = new Date(a.created_at || a.createdAt || 0);
            const dateB = new Date(b.created_at || b.createdAt || 0);
            return dateB - dateA;
          })
        : [];
      
      setTrips(sortedTrips);
    } catch (error) {
      console.error('Fetch trips error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to fetch trips');
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleTripPress = (trip) => {
    navigation.navigate('TripDetail', { tripId: trip.id || trip.trip_id });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrips();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch (e) {
      return 'N/A';
    }
  };

  const filteredTrips = selectedFilter === 'all' 
    ? trips 
    : trips.filter(trip => trip.status === selectedFilter);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Trip History</Text>
      
      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'all' && styles.filterButtonActive]}
          onPress={() => setSelectedFilter('all')}
        >
          <Text style={[styles.filterButtonText, selectedFilter === 'all' && styles.filterButtonTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'completed' && styles.filterButtonActive]}
          onPress={() => setSelectedFilter('completed')}
        >
          <Text style={[styles.filterButtonText, selectedFilter === 'completed' && styles.filterButtonTextActive]}>Completed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'in_progress' && styles.filterButtonActive]}
          onPress={() => setSelectedFilter('in_progress')}
        >
          <Text style={[styles.filterButtonText, selectedFilter === 'in_progress' && styles.filterButtonTextActive]}>In Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'cancelled' && styles.filterButtonActive]}
          onPress={() => setSelectedFilter('cancelled')}
        >
          <Text style={[styles.filterButtonText, selectedFilter === 'cancelled' && styles.filterButtonTextActive]}>Cancelled</Text>
        </TouchableOpacity>
      </View>

      {filteredTrips.length === 0 ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.emptyState}>
            <Text>No trips yet. Book your first ride!</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filteredTrips}
          keyExtractor={(item, index) => (item.id || item.trip_id || index).toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item: trip }) => (
            <TouchableOpacity
              style={styles.tripCard}
              onPress={() => handleTripPress(trip)}
            >
              <View style={styles.tripRouteContainer}>
                <View style={styles.tripRoutePoint}>
                  <View style={styles.tripRouteIndicatorGreen} />
                  <Text style={styles.tripRoute}>{trip.pickup_address || 'Pickup Location'}</Text>
                </View>
                <View style={styles.tripRouteSeparator}>↓</View>
                <View style={styles.tripRoutePoint}>
                  <View style={styles.tripRouteIndicatorRed} />
                  <Text style={styles.tripRoute}>{trip.drop_address || trip.dropoff_address || 'Dropoff Location'}</Text>
                </View>
              </View>
              
              <View style={statusBadgeStyle(trip.status)}>
                <Text style={[styles.statusBadgeText, statusTextStyle(trip.status)]}>
                  {trip.status || 'requested'}
                </Text>
              </View>

              <Text style={styles.tripPrice}>
                PKR {trip.accepted_price || trip.final_price || trip.proposed_price || '0'}
              </Text>
              
              <Text style={styles.tripDate}>{formatDate(trip.created_at || trip.createdAt)}</Text>
              
              {userRole === 'passenger' && trip.driver_name && (
                <Text style={styles.tripParticipant}>Driver: {trip.driver_name}</Text>
              )}
              {userRole === 'driver' && trip.passenger_name && (
                <Text style={styles.tripParticipant}>Passenger: {trip.passenger_name}</Text>
              )}

              {trip.rating && (
                <Text style={styles.tripRating}>⭐ {trip.rating}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ========================================
// SCREEN 7.5: TRIP DETAIL
// ========================================
function TripDetailScreen({ route, navigation }) {
  const { tripId } = route.params || {};
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState('passenger');

  useEffect(() => {
    loadUserRole();
    if (tripId) {
      loadTripDetails();
    } else {
      setError('Trip ID is required');
      setLoading(false);
    }
  }, [tripId]);

  const loadUserRole = async () => {
    const user = await getUserDataStorage();
    if (user) {
      setUserRole(user.role);
    }
  };

  const loadTripDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/trips/${tripId}`);
      setTripData(response.data);
    } catch (error) {
      console.error('Load trip details error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to load trip details');
      setError(errorMessage);
      Alert.alert('Error', errorMessage, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch (e) {
      return 'N/A';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <View style={styles.tripDetailContainer}>
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 50 }} />
      </View>
    );
  }

  if (error || !tripData) {
    return (
      <View style={styles.tripDetailContainer}>
        <Text style={{ color: '#ef4444', textAlign: 'center', margin: 20 }}>{error || 'Trip not found'}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const participantName = userRole === 'passenger' 
    ? (tripData.driver_name || 'Driver')
    : (tripData.passenger_name || 'Passenger');
  const participantInitial = participantName.charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.tripDetailContainer}>
      {/* Trip Status Header */}
      <View style={styles.tripDetailHeader}>
        <Text style={styles.tripDetailId}>Trip #{tripData.id || tripData.trip_id}</Text>
        <View style={statusBadgeStyle(tripData.status)}>
          <Text style={[styles.statusBadgeText, statusTextStyle(tripData.status)]}>
            {tripData.status || 'requested'}
          </Text>
        </View>
        <Text style={styles.tripDetailDate}>{formatDate(tripData.created_at || tripData.createdAt)}</Text>
      </View>

      {/* Route Information */}
      <View style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Route</Text>
        <View style={styles.routePoint}>
          <View style={styles.routePointIndicator} />
          <View style={styles.routeTextContainer}>
            <Text style={styles.routeTextLabel}>Pickup</Text>
            <Text style={styles.routeText}>{tripData.pickup_address || 'Pickup Location'}</Text>
            {tripData.pickup_lat && tripData.pickup_lng && (
              <Text style={styles.routeCoordinates}>
                {tripData.pickup_lat.toFixed(6)}, {tripData.pickup_lng.toFixed(6)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routePointIndicator, styles.routePointIndicatorEnd]} />
          <View style={styles.routeTextContainer}>
            <Text style={styles.routeTextLabel}>Dropoff</Text>
            <Text style={styles.routeText}>{tripData.drop_address || tripData.dropoff_address || 'Dropoff Location'}</Text>
            {tripData.drop_lat && tripData.drop_lng && (
              <Text style={styles.routeCoordinates}>
                {tripData.drop_lat.toFixed(6)}, {tripData.drop_lng.toFixed(6)}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Participant Information */}
      <View style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>
          {userRole === 'passenger' ? 'Driver Information' : 'Passenger Information'}
        </Text>
        <View style={styles.participantInfo}>
          <View style={styles.participantAvatar}>
            <Text style={styles.participantAvatarText}>{participantInitial}</Text>
          </View>
          <View style={styles.participantDetails}>
            <Text style={styles.participantName}>{participantName}</Text>
            {userRole === 'passenger' && tripData.vehicle_info && (
              <Text style={styles.participantMeta}>{tripData.vehicle_info}</Text>
            )}
            {userRole === 'passenger' && tripData.vehicle_make && tripData.vehicle_model && (
              <Text style={styles.participantMeta}>
                {tripData.vehicle_make} {tripData.vehicle_model} - {tripData.vehicle_plate || 'N/A'}
              </Text>
            )}
            {userRole === 'passenger' && tripData.vehicle_type && (
              <Text style={styles.participantMeta}>Type: {tripData.vehicle_type}</Text>
            )}
            {userRole === 'passenger' && tripData.driver_rating && (
              <Text style={styles.participantMeta}>Rating: ⭐ {tripData.driver_rating}</Text>
            )}
            {tripData.status === 'completed' && tripData.driver_phone && userRole === 'passenger' && (
              <Text style={styles.participantMeta}>Phone: {tripData.driver_phone}</Text>
            )}
            {tripData.status === 'completed' && tripData.passenger_phone && userRole === 'driver' && (
              <Text style={styles.participantMeta}>Phone: {tripData.passenger_phone}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Price Information */}
      <View style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Price</Text>
        {tripData.proposed_price && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Proposed Price:</Text>
            <Text style={styles.priceValue}>PKR {tripData.proposed_price}</Text>
          </View>
        )}
        {tripData.accepted_price && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Accepted Price:</Text>
            <Text style={styles.priceValue}>PKR {tripData.accepted_price}</Text>
          </View>
        )}
        {tripData.final_price && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Final Price:</Text>
            <Text style={styles.priceValue}>PKR {tripData.final_price}</Text>
          </View>
        )}
      </View>

      {/* Trip Timeline */}
      {tripData.status === 'completed' && (
        <View style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Trip Timeline</Text>
          {tripData.created_at && (
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Requested</Text>
                <Text style={styles.timelineTime}>
                  {formatDate(tripData.created_at)} at {formatTime(tripData.created_at)}
                </Text>
              </View>
            </View>
          )}
          {tripData.started_at && (
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Started</Text>
                <Text style={styles.timelineTime}>
                  {formatDate(tripData.started_at)} at {formatTime(tripData.started_at)}
                </Text>
              </View>
            </View>
          )}
          {tripData.completed_at && (
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Completed</Text>
                <Text style={styles.timelineTime}>
                  {formatDate(tripData.completed_at)} at {formatTime(tripData.completed_at)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Rating Section */}
      {tripData.status === 'completed' && (
        <View style={styles.detailCard}>
          {tripData.rating ? (
            <View style={styles.ratingContainer}>
              <Text style={styles.detailCardTitle}>Your Rating</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Text key={star} style={styles.ratingStar}>
                    {star <= (tripData.rating || 0) ? '⭐' : '☆'}
                  </Text>
                ))}
              </View>
              {tripData.rating_comment && (
                <Text style={styles.ratingComment}>"{tripData.rating_comment}"</Text>
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.detailCardTitle}>Rate this trip</Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Rating', {
                  tripId: tripData.id || tripData.trip_id,
                  driverName: tripData.driver_name,
                  passengerName: tripData.passenger_name,
                  vehicleInfo: tripData.vehicle_info
                })}
              >
                <Text style={styles.buttonText}>Rate this trip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      {tripData.status === 'in_progress' && (
        <View style={styles.detailCard}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (userRole === 'passenger') {
                navigation.navigate('ActiveTrip', {
                  tripId: tripData.id || tripData.trip_id,
                  driverId: tripData.driver_id,
                  driverName: tripData.driver_name,
                  vehicleInfo: tripData.vehicle_info,
                  acceptedPrice: tripData.accepted_price,
                  pickupAddress: tripData.pickup_address,
                  dropoffAddress: tripData.drop_address || tripData.dropoff_address,
                  pickupCoords: tripData.pickup_lat && tripData.pickup_lng ? {
                    latitude: tripData.pickup_lat,
                    longitude: tripData.pickup_lng
                  } : null,
                  dropoffCoords: tripData.drop_lat && tripData.drop_lng ? {
                    latitude: tripData.drop_lat,
                    longitude: tripData.drop_lng
                  } : null
                });
              } else {
                navigation.navigate('DriverActiveTrip', {
                  tripId: tripData.id || tripData.trip_id,
                  passengerId: tripData.passenger_id,
                  passengerName: tripData.passenger_name,
                  pickupAddress: tripData.pickup_address,
                  dropoffAddress: tripData.drop_address || tripData.dropoff_address,
                  acceptedPrice: tripData.accepted_price,
                  pickupCoords: tripData.pickup_lat && tripData.pickup_lng ? {
                    latitude: tripData.pickup_lat,
                    longitude: tripData.pickup_lng
                  } : null,
                  dropoffCoords: tripData.drop_lat && tripData.drop_lng ? {
                    latitude: tripData.drop_lat,
                    longitude: tripData.drop_lng
                  } : null
                });
              }
            }}
          >
            <Text style={styles.buttonText}>View Active Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={[styles.button, { marginBottom: 20 }]} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ========================================
// SCREEN 8: CHAT SCREEN (moved to screens/ChatScreen.js)
// ========================================

// ========================================
// SCREEN 9: CALL SCREEN (moved to screens/CallScreen.js)
// ========================================

// ========================================
// SCREEN 10: PROFILE
// ========================================
function ProfileScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (userData?.name) {
      setEditedName(userData.name);
    }
  }, [userData]);

  const loadUserData = async () => {
    try {
      // Load from storage first
      let cachedUserData = await getUserDataStorage() || {};
      if (cachedUserData) {
        setUserData(cachedUserData);
        setEditedName(cachedUserData.name || '');
      }

      // Fetch latest from backend
      const response = await api.get('/me');
      const user = response.data;
      const updatedUserData = {
        ...cachedUserData,
        name: user.name,
        phone: user.phone,
        role: user.role,
        emergencyContact: user.emergencyContact,
        trustedContacts: user.trustedContacts,
        ...(user.driver && { driver: user.driver })
      };

      // Update both storage and state (sanitize to remove any base64 data URIs)
      const sanitizedUserData = sanitizeUserDataForStorage(updatedUserData);
      await setUserDataStorage(sanitizedUserData);
      setUserData(sanitizedUserData);
      setEditedName(user.name || '');
    } catch (error) {
      console.error('Load user data error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to load profile');
      Alert.alert('Error', errorMessage);
    }
  };

  const saveProfile = async () => {
    if (!editedName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const response = await api.put('/me', { name: editedName.trim() });
      const updatedUser = response.data;

      // Update storage (sanitize to remove any base64 data URIs)
      const userDataObj = await getUserDataStorage() || {};
      const updatedUserData = {
        ...userDataObj,
        name: updatedUser.name
      };
      const sanitizedUserData = sanitizeUserDataForStorage(updatedUserData);
      await setUserDataStorage(sanitizedUserData);

      // Update state
      setUserData(sanitizedUserData);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Save profile error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to save profile');
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  const logout = async () => {
    await clearAuthTokens();
    const socket = getSocket();
    if (socket) socket.disconnect();
    navigation.replace('Welcome');
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.profileHeader}>
        <Text style={styles.pageTitle}>Profile</Text>
        {!isEditing ? (
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
            onPress={saveProfile}
            disabled={saving}
          >
            <Text style={styles.editButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.profileCard}>
        {!isEditing ? (
          <>
            <Text style={styles.profileName}>{userData?.name}</Text>
            <Text style={styles.profilePhone}>{userData?.phone}</Text>
            <Text style={styles.profileRole}>{userData?.role}</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Enter your name"
            />
            <Text style={styles.profilePhone}>{userData?.phone}</Text>
            <Text style={styles.profileRole}>{userData?.role}</Text>
          </>
        )}
      </View>

      {userData?.role === 'driver' && userData?.driver && (
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>Driver Statistics</Text>
          <Text style={styles.profilePhone}>Total Trips: {userData.driver.total_trips || 0}</Text>
          <Text style={styles.profilePhone}>Average Rating: {userData.driver.average_rating ? userData.driver.average_rating.toFixed(1) : 'N/A'}</Text>
          <Text style={styles.profilePhone}>Verification Status: {userData.driver.verification_status || 'Pending'}</Text>
        </View>
      )}

      <TouchableOpacity 
        style={styles.emergencyContactsBtn} 
        onPress={() => navigation.navigate('EmergencyContacts')}
      >
        <Text style={styles.emergencyContactsBtnText}>🚨 Emergency Contacts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutBtnText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ========================================
// PHOTO ITEM COMPONENT
// ========================================
const PhotoItem = ({ label, uri, onPress, onError, imageStyle, placeholderStyle, hasError }) => {
  if (uri && !hasError) {
    return (
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.photoLabel}>{label}</Text>
        <Image
          source={{ uri }}
          style={imageStyle}
          resizeMode="cover"
          onError={onError}
        />
      </TouchableOpacity>
    );
  }
  
  return (
    <View>
      <Text style={styles.photoLabel}>{label}</Text>
      <View style={placeholderStyle} />
    </View>
  );
};

// ========================================
// SCREEN 11: ADMIN DASHBOARD
// ========================================
function AdminDashboardScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [sosEvents, setSosEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [verifyingDriverId, setVerifyingDriverId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageErrors, setImageErrors] = useState({}); // Map of driverId -> { licenseError, vehicleError, cnicError }
  const [modalImageErrors, setModalImageErrors] = useState({ licenseError: false, vehicleError: false, cnicError: false });

  useEffect(() => {
    verifyAdminAccess();
  }, []);

  const verifyAdminAccess = async () => {
    try {
      // First check cached role for quick feedback
      const cachedUser = await getUserDataStorage();
      
      if (cachedUser && cachedUser.role !== 'admin') {
        Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
          { text: 'OK', onPress: () => navigation.replace('Main') }
        ]);
        return;
      }

      // Verify role with server
      try {
        const response = await api.get('/me');
        const user = response.data;
        
        if (user.role !== 'admin') {
          Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
            { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }
          ]);
          return;
        }
        
        // Update cached user data with server-confirmed role
        await setUserDataStorage({ ...cachedUser, role: user.role });
        setIsAuthorized(true);
        loadAdminData();
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          Alert.alert('Unauthorized', 'You do not have permission to access this screen.', [
            { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }
          ]);
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error('Verify admin access error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to verify admin access');
      Alert.alert('Error', errorMessage, [
        { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }
      ]);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [statsResponse, driversResponse, sosResponse] = await Promise.all([
        api.get('/admin/stats').catch((error) => {
          if (error.response?.status === 403) {
            // Redirect on 403
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
            throw error;
          }
          throw error;
        }),
        api.get('/admin/drivers/pending').catch((error) => {
          if (error.response?.status === 403) {
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
            throw error;
          }
          throw error;
        }),
        api.get('/sos').catch(() => ({ data: [] })) // Handle if endpoint doesn't exist
      ]);

      setStats(statsResponse.data);
      setPendingDrivers(driversResponse.data || []);
      setSosEvents(sosResponse.data || []);
    } catch (error) {
      if (error.response?.status === 403) {
        // Already handled redirect above
        return;
      }
      console.error('Load admin data error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to load admin data');
      Alert.alert('Error', errorMessage, [
        { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAdminData();
  };

  const handleVerifyDriver = async (driverId, status) => {
    Alert.alert(
      'Confirm',
      `Are you sure you want to ${status === 'verified' ? 'verify' : 'reject'} this driver?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'verified' ? 'Verify' : 'Reject',
          style: status === 'verified' ? 'default' : 'destructive',
          onPress: async () => {
            setVerifyingDriverId(driverId);
            try {
              await api.post(`/admin/drivers/${driverId}/verify`, { status });
              setPendingDrivers(pendingDrivers.filter(d => (d.id || d.driver_id) !== driverId));
              Alert.alert('Success', `Driver ${status === 'verified' ? 'verified' : 'rejected'} successfully`);
              setShowDriverModal(false);
              setSelectedDriver(null);
              await loadAdminData();
            } catch (error) {
              if (error.response?.status === 403) {
                Alert.alert('Unauthorized', 'You do not have permission to perform this action.', [
                  { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }
                ]);
                return;
              }
              console.error('Verify driver error:', error);
              const errorMessage = buildNetworkErrorMessage(error, 'Failed to verify driver');
              Alert.alert('Error', errorMessage);
            } finally {
              setVerifyingDriverId(null);
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (e) {
      return 'N/A';
    }
  };

  // Block rendering if not authorized
  if (!isAuthorized && !loading) {
    return null;
  }

  if (loading && !stats) {
    return (
      <View style={styles.adminContainer}>
        <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 50 }} />
      </View>
    );
  }

  return (
    <View style={styles.adminContainer}>
      {/* Tab Navigation */}
      <View style={styles.adminTabs}>
        <TouchableOpacity
          style={[styles.adminTab, activeTab === 'overview' && styles.adminTabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.adminTabText, activeTab === 'overview' && styles.adminTabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.adminTab, activeTab === 'drivers' && styles.adminTabActive]}
          onPress={() => setActiveTab('drivers')}
        >
          <Text style={[styles.adminTabText, activeTab === 'drivers' && styles.adminTabTextActive]}>
            Drivers ({pendingDrivers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.adminTab, activeTab === 'sos' && styles.adminTabActive]}
          onPress={() => setActiveTab('sos')}
        >
          <Text style={[styles.adminTabText, activeTab === 'sos' && styles.adminTabTextActive]}>
            SOS ({sosEvents.filter(e => e.status === 'active').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.total_users || 0}</Text>
              <Text style={styles.statLabel}>👥 Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.total_drivers || 0}</Text>
              <Text style={styles.statLabel}>🚗 Total Drivers</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.total_trips || 0}</Text>
              <Text style={styles.statLabel}>🗺️ Total Trips</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: '#10b981' }]}>
                {stats?.active_trips || 0}
              </Text>
              <Text style={styles.statLabel}>Active Trips</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.completed_trips || 0}</Text>
              <Text style={styles.statLabel}>✓ Completed Trips</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.verified_drivers || 0}</Text>
              <Text style={styles.statLabel}>Verified Drivers</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats?.sos_events || sosEvents.length}</Text>
              <Text style={styles.statLabel}>🚨 SOS Events</Text>
            </View>
            <View style={[styles.statCard, (stats?.active_sos || sosEvents.filter(e => e.status === 'active').length) > 0 && styles.statCardAlert]}>
              <Text style={[styles.statNumber, (stats?.active_sos || sosEvents.filter(e => e.status === 'active').length) > 0 && styles.statNumberAlert]}>
                {stats?.active_sos || sosEvents.filter(e => e.status === 'active').length}
              </Text>
              <Text style={styles.statLabel}>Active SOS</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Drivers Tab */}
      {activeTab === 'drivers' && (
        <FlatList
          data={pendingDrivers}
          keyExtractor={(item, index) => (item.id || item.driver_id || index).toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text>No pending verifications</Text>
            </View>
          }
          renderItem={({ item: driver }) => {
            const driverId = driver.id || driver.driver_id;
            const isVerifying = verifyingDriverId === driverId;
            const licensePhoto = driver.license_photo_url || driver.license_photo;
            const vehiclePhoto = driver.vehicle_photo_url || driver.vehicle_photo;
            const cnicPhoto = driver.cnic_photo_url || driver.cnic_photo;
            const driverErrors = imageErrors[driverId] || { licenseError: false, vehicleError: false, cnicError: false };
            
            return (
              <View style={styles.driverVerificationCard}>
                <TouchableOpacity
                  style={styles.viewDetailsButton}
                  onPress={() => {
                    setSelectedDriver(driver);
                    setModalImageErrors({ licenseError: false, vehicleError: false, cnicError: false });
                    setShowDriverModal(true);
                  }}
                >
                  <Text style={styles.viewDetailsButtonText}>View Details</Text>
                </TouchableOpacity>
                
                <View style={styles.driverVerificationHeader}>
                  <Text style={styles.driverVerificationName}>
                    {driver.name || driver.driver_name || 'Driver'}
                  </Text>
                  <Text style={styles.driverVerificationPhone}>{driver.phone || 'N/A'}</Text>
                </View>
                
                <View style={styles.driverVerificationInfo}>
                  {driver.vehicle_make && (
                    <>
                      <Text style={styles.driverVerificationLabel}>Vehicle:</Text>
                      <Text style={styles.driverVerificationValue}>
                        {driver.vehicle_make} {driver.vehicle_model || ''} - {driver.vehicle_plate || 'N/A'}
                      </Text>
                    </>
                  )}
                  {driver.vehicle_year && (
                    <>
                      <Text style={styles.driverVerificationLabel}>Year:</Text>
                      <Text style={styles.driverVerificationValue}>{driver.vehicle_year}</Text>
                    </>
                  )}
                  {driver.vehicle_type && (
                    <>
                      <Text style={styles.driverVerificationLabel}>Type:</Text>
                      <Text style={styles.driverVerificationValue}>{driver.vehicle_type}</Text>
                    </>
                  )}
                  {driver.license_number && (
                    <>
                      <Text style={styles.driverVerificationLabel}>License:</Text>
                      <Text style={styles.driverVerificationValue}>{driver.license_number}</Text>
                    </>
                  )}
                </View>

                <View style={styles.driverVerificationImages}>
                  <PhotoItem
                    label="License"
                    uri={licensePhoto}
                    onPress={() => setSelectedImage(licensePhoto)}
                    onError={() => {
                      setImageErrors(prev => ({
                        ...prev,
                        [driverId]: { ...(prev[driverId] || {}), licenseError: true }
                      }));
                    }}
                    imageStyle={styles.driverVerificationImage}
                    placeholderStyle={styles.photoPlaceholder}
                    hasError={driverErrors.licenseError}
                  />
                  <PhotoItem
                    label="Vehicle"
                    uri={vehiclePhoto}
                    onPress={() => setSelectedImage(vehiclePhoto)}
                    onError={() => {
                      setImageErrors(prev => ({
                        ...prev,
                        [driverId]: { ...(prev[driverId] || {}), vehicleError: true }
                      }));
                    }}
                    imageStyle={styles.driverVerificationImage}
                    placeholderStyle={styles.photoPlaceholder}
                    hasError={driverErrors.vehicleError}
                  />
                  <PhotoItem
                    label="CNIC"
                    uri={cnicPhoto}
                    onPress={() => setSelectedImage(cnicPhoto)}
                    onError={() => {
                      setImageErrors(prev => ({
                        ...prev,
                        [driverId]: { ...(prev[driverId] || {}), cnicError: true }
                      }));
                    }}
                    imageStyle={styles.driverVerificationImage}
                    placeholderStyle={styles.photoPlaceholder}
                    hasError={driverErrors.cnicError}
                  />
                </View>

                <View style={styles.verificationActions}>
                  <TouchableOpacity
                    style={[styles.verifyButton, isVerifying && styles.buttonDisabled]}
                    onPress={() => handleVerifyDriver(driverId, 'verified')}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.verificationButtonText}>Verify</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectButton, isVerifying && styles.buttonDisabled]}
                    onPress={() => handleVerifyDriver(driverId, 'rejected')}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.verificationButtonText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Driver Detail Modal */}
      <Modal
        visible={showDriverModal && selectedDriver !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowDriverModal(false);
          setSelectedDriver(null);
          setSelectedImage(null);
          setModalImageErrors({ licenseError: false, vehicleError: false, cnicError: false });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.driverDetailModal}>
            <ScrollView showsVerticalScrollIndicator={true}>
              {/* Header */}
              <View style={styles.driverDetailHeader}>
                <Text style={styles.driverVerificationName}>
                  {selectedDriver?.name || selectedDriver?.driver_name || 'Driver'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowDriverModal(false);
                    setSelectedDriver(null);
                    setSelectedImage(null);
                    setModalImageErrors({ licenseError: false, vehicleError: false, cnicError: false });
                  }}
                  style={styles.closeModalButton}
                >
                  <Text style={{ color: '#6b7280', fontSize: 24, fontWeight: 'bold' }}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Personal Information Section */}
              <View style={styles.driverDetailSection}>
                <Text style={styles.driverVerificationLabel}>Phone:</Text>
                <Text style={styles.driverVerificationValue}>{selectedDriver?.phone || 'N/A'}</Text>
                
                {selectedDriver?.license_number && (
                  <>
                    <Text style={styles.driverVerificationLabel}>License Number:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.license_number}</Text>
                  </>
                )}
              </View>

              {/* Vehicle Information Section */}
              <View style={styles.driverDetailSection}>
                <Text style={[styles.driverVerificationLabel, { fontSize: 16, fontWeight: 'bold', marginBottom: 8 }]}>Vehicle Details</Text>
                
                {selectedDriver?.vehicle_make && (
                  <>
                    <Text style={styles.driverVerificationLabel}>Make:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.vehicle_make}</Text>
                  </>
                )}
                
                {selectedDriver?.vehicle_model && (
                  <>
                    <Text style={styles.driverVerificationLabel}>Model:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.vehicle_model}</Text>
                  </>
                )}
                
                {selectedDriver?.vehicle_year && (
                  <>
                    <Text style={styles.driverVerificationLabel}>Year:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.vehicle_year}</Text>
                  </>
                )}
                
                {selectedDriver?.vehicle_plate && (
                  <>
                    <Text style={styles.driverVerificationLabel}>Plate Number:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.vehicle_plate}</Text>
                  </>
                )}
                
                {selectedDriver?.vehicle_type && (
                  <>
                    <Text style={styles.driverVerificationLabel}>Type:</Text>
                    <Text style={styles.driverVerificationValue}>{selectedDriver.vehicle_type}</Text>
                  </>
                )}
              </View>

              {/* Documents Section */}
              <View style={styles.driverDetailSection}>
                <Text style={[styles.driverVerificationLabel, { fontSize: 16, fontWeight: 'bold', marginBottom: 8 }]}>Documents</Text>
                <View style={styles.driverDetailPhotosGrid}>
                  <View style={styles.photoItemContainer}>
                    <PhotoItem
                      label="License Photo"
                      uri={selectedDriver && (selectedDriver.license_photo_url || selectedDriver.license_photo)}
                      onPress={() => setSelectedImage(selectedDriver.license_photo_url || selectedDriver.license_photo)}
                      onError={() => {
                        setModalImageErrors(prev => ({ ...prev, licenseError: true }));
                      }}
                      imageStyle={styles.driverDetailPhoto}
                      placeholderStyle={[styles.photoPlaceholder, { width: 200, height: 200 }]}
                      hasError={modalImageErrors.licenseError}
                    />
                  </View>
                  
                  <View style={styles.photoItemContainer}>
                    <PhotoItem
                      label="Vehicle Photo"
                      uri={selectedDriver && (selectedDriver.vehicle_photo_url || selectedDriver.vehicle_photo)}
                      onPress={() => setSelectedImage(selectedDriver.vehicle_photo_url || selectedDriver.vehicle_photo)}
                      onError={() => {
                        setModalImageErrors(prev => ({ ...prev, vehicleError: true }));
                      }}
                      imageStyle={styles.driverDetailPhoto}
                      placeholderStyle={[styles.photoPlaceholder, { width: 200, height: 200 }]}
                      hasError={modalImageErrors.vehicleError}
                    />
                  </View>
                  
                  <View style={styles.photoItemContainer}>
                    <PhotoItem
                      label="CNIC Photo"
                      uri={selectedDriver && (selectedDriver.cnic_photo_url || selectedDriver.cnic_photo)}
                      onPress={() => setSelectedImage(selectedDriver.cnic_photo_url || selectedDriver.cnic_photo)}
                      onError={() => {
                        setModalImageErrors(prev => ({ ...prev, cnicError: true }));
                      }}
                      imageStyle={styles.driverDetailPhoto}
                      placeholderStyle={[styles.photoPlaceholder, { width: 200, height: 200 }]}
                      hasError={modalImageErrors.cnicError}
                    />
                  </View>
                </View>
              </View>

              {/* Additional Info */}
              {selectedDriver && (selectedDriver.rating !== undefined || selectedDriver.total_trips !== undefined) && (
                <View style={styles.driverDetailSection}>
                  <Text style={[styles.driverVerificationLabel, { fontSize: 16, fontWeight: 'bold', marginBottom: 8 }]}>Additional Information</Text>
                  {selectedDriver.rating !== undefined && (
                    <>
                      <Text style={styles.driverVerificationLabel}>Rating:</Text>
                      <Text style={styles.driverVerificationValue}>{selectedDriver.rating || 'N/A'}</Text>
                    </>
                  )}
                  {selectedDriver.total_trips !== undefined && (
                    <>
                      <Text style={styles.driverVerificationLabel}>Total Trips:</Text>
                      <Text style={styles.driverVerificationValue}>{selectedDriver.total_trips || 0}</Text>
                    </>
                  )}
                </View>
              )}

              {/* Verification Actions */}
              {selectedDriver && (
                <View style={styles.verificationActions}>
                  <TouchableOpacity
                    style={[styles.verifyButton, verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id) && styles.buttonDisabled]}
                    onPress={() => handleVerifyDriver(selectedDriver.id || selectedDriver.driver_id, 'verified')}
                    disabled={verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id)}
                  >
                    {verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id) ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.verificationButtonText}>Verify</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectButton, verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id) && styles.buttonDisabled]}
                    onPress={() => handleVerifyDriver(selectedDriver.id || selectedDriver.driver_id, 'rejected')}
                    disabled={verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id)}
                  >
                    {verifyingDriverId === (selectedDriver.id || selectedDriver.driver_id) ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.verificationButtonText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Preview Modal */}
      <Modal
        visible={selectedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.fullscreenImageModal}>
          <TouchableOpacity
            style={styles.closeImageButton}
            onPress={() => setSelectedImage(null)}
          >
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: 'bold' }}>×</Text>
          </TouchableOpacity>
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* SOS Tab */}
      {activeTab === 'sos' && (
        <FlatList
          data={[...sosEvents].sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))}
          keyExtractor={(item, index) => (item.id || item.sos_id || index).toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text>No SOS events</Text>
            </View>
          }
          renderItem={({ item: sos }) => (
            <View style={[styles.sosEventCard, sos.status === 'active' && styles.sosEventCardActive]}>
              <View style={styles.sosEventHeader}>
                <Text style={styles.sosEventId}>SOS #{sos.id || sos.sos_id}</Text>
                <View style={[styles.sosEventStatus, sos.status === 'active' ? styles.sosEventStatusActive : styles.sosEventStatusResolved]}>
                  <Text style={{ color: sos.status === 'active' ? '#dc2626' : '#065f46' }}>
                    {sos.status || 'active'}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.sosEventMessage}>{sos.message || 'Emergency SOS'}</Text>
              
              {sos.user_name && (
                <Text style={styles.sosEventMeta}>User: {sos.user_name}</Text>
              )}
              
              {sos.trip_id && (
                <TouchableOpacity onPress={() => navigation.navigate('TripDetail', { tripId: sos.trip_id })}>
                  <Text style={[styles.sosEventMeta, { color: '#3b82f6' }]}>Trip ID: {sos.trip_id}</Text>
                </TouchableOpacity>
              )}
              
              {sos.location_lat && sos.location_lng && (
                <Text style={styles.sosEventMeta}>
                  Location: {sos.location_lat.toFixed(6)}, {sos.location_lng.toFixed(6)}
                </Text>
              )}
              
              <Text style={styles.sosEventMeta}>Time: {formatDate(sos.created_at || sos.createdAt)}</Text>
              
              <View style={styles.sosEventActions}>
                {sos.location_lat && sos.location_lng && (
                  <TouchableOpacity
                    style={styles.sosEventButton}
                    onPress={() => {
                      Linking.openURL(
                        `https://www.google.com/maps?q=${sos.location_lat},${sos.location_lng}`
                      ).catch(() => Alert.alert('Error', 'Failed to open maps'));
                    }}
                  >
                    <Text style={styles.sosEventButtonText}>View Location</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ========================================
// SCREEN 11: RATING SCREEN (moved to screens/RatingScreen.js)
// ========================================

// ========================================
// NAVIGATION TABS
// ========================================
function MainTabs() {
  const [userRole, setUserRole] = useState('passenger');

  useEffect(() => {
    loadRole();
  }, []);

  const loadRole = async () => {
    const user = await getUserDataStorage();
    if (user) {
      setUserRole(user.role);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#ec4899',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      }}
    >
      {userRole === 'admin' ? (
        <>
          <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
          <Tab.Screen name="Trips" component={TripsHistoryScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : userRole === 'passenger' ? (
        <>
          <Tab.Screen name="Home" component={PassengerHomeScreen} />
          <Tab.Screen name="Trips" component={TripsHistoryScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Tab.Screen name="Dashboard" component={DriverDashboardScreen} />
          <Tab.Screen name="Trips" component={TripsHistoryScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

// ========================================
// MAIN APP
// ========================================
export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <ToastProvider>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="LoginFlow" component={LoginFlow} />
              <Stack.Screen name="SignInFlow" component={SignInFlow} />
              <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="BookRide" component={BookRideScreen} />
            <Stack.Screen 
              name="ActiveTrip" 
              component={ActiveTripScreen} 
              options={({ navigation }) => ({ 
                headerShown: true, 
                title: 'Active Trip', 
                headerBackVisible: false,
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Exit Trip',
                        tripStatus === 'in_progress' 
                          ? 'You have an active trip in progress. Are you sure you want to exit? This will leave the trip room but the trip will continue.'
                          : 'Are you sure you want to exit? You have an active trip.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Exit', 
                            style: 'destructive',
                            onPress: async () => {
                              // Leave trip room before exiting
                              if (tripId) {
                                socketManager.leaveTrip(tripId);
                              }
                              
                              // Persist active trip info for potential return
                              if (tripId) {
                                await AsyncStorage.setItem('lastActiveTrip', JSON.stringify({
                                  tripId: normalizeTripId(tripId),
                                  tripStatus,
                                  timestamp: Date.now()
                                }));
                              }
                              
                              navigation.reset({ 
                                index: 0, 
                                routes: [{ name: 'Main' }] 
                              });
                            }
                          },
                        ]
                      );
                    }}
                    style={{ marginRight: 16 }}
                  >
                    <Text style={{ color: '#ef4444', fontSize: 16 }}>Exit</Text>
                  </TouchableOpacity>
                ),
              })} 
            />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Call" component={CallScreen} />
            <Stack.Screen name="MakeOffer" component={MakeOfferScreen} />
            <Stack.Screen 
              name="DriverActiveTrip" 
              component={DriverActiveTripScreen} 
              options={{ 
                headerShown: true, 
                title: 'Active Trip', 
                headerBackVisible: false 
              }} 
            />
                        <Stack.Screen
              name="Rating"
              component={RatingScreen}
              options={{
                headerShown: true,
                title: 'Rate Trip',
                headerBackVisible: false
              }}
            />
            <Stack.Screen
              name="EmergencyContacts"
              component={EmergencyContactsScreen}
              options={{
                headerShown: true,
                title: 'Emergency Contacts'
              }}
            />
            <Stack.Screen
              name="TripDetail"
              component={TripDetailScreen}
              options={{
                headerShown: true,
                title: 'Trip Details'
              }}
            />
            <Stack.Screen
              name="DriverRegistration"
              component={DriverRegistrationScreen}
              options={{
                headerShown: true,
                title: 'Driver Registration',
                headerBackVisible: false
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </PaperProvider>
    </SafeAreaProvider>
  );
}

// ========================================
// STYLES
// ========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // Premium light blue-gray background
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  splashTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4F46E5' // Premium indigo blue
  },
  splashSubtitle: {
    fontSize: 24,
    color: '#9ca3af',
    marginTop: 8
  },
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20
  },
  welcomeLogo: {
    width: 120,
    height: 120,
    marginBottom: 24,
    resizeMode: 'contain'
  },
  welcomeTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4F46E5',
    marginBottom: 16,
    textAlign: 'center'
  },
  welcomeTagline: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 40
  },
  welcomeButtonContainer: {
    width: '100%',
    paddingHorizontal: 20
  },
  loginButton: {
    backgroundColor: '#4F46E5',
    marginBottom: 16
  },
  signInButton: {
    backgroundColor: '#ec4899',
    marginBottom: 0
  },
  welcomeHelperText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8
  },
  loginHeader: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4F46E5' // Premium blue
  },
  loginFlowTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4F46E5',
    marginBottom: 8,
    textAlign: 'center'
  },
  signInFlowTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ec4899',
    marginBottom: 8,
    textAlign: 'center'
  },
  flowSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24
  },
  loginForm: {
    paddingHorizontal: 20,
    paddingBottom: 60
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151'
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0', // Softer border
    borderRadius: 12,
    padding: 16, // Increased for premium feel
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    shadowColor: '#000', // Shadow for depth
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  button: {
    backgroundColor: '#4F46E5', // Premium indigo blue
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  linkText: {
    color: '#4F46E5',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12
  },
  linkButton: {
    minHeight: 44,
    minWidth: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'center'
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  roleBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center'
  },
  roleBtnActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#eef2ff' // Light blue active
  },
  roleText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600'
  },
  roleTextActive: {
    color: '#4F46E5'
  },
  imagePickerButton: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginBottom: 16
  },
  imagePickerButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600'
  },
  imagePreviewContainer: {
    marginBottom: 16,
    alignItems: 'center'
  },
  profileImagePreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#4F46E5'
  },
  removeImageButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  removeImageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  greeting: {
    fontSize: 14,
    color: '#6b7280'
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  sosBtn: {
    backgroundColor: '#ef4444',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  sosText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  mapContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  map: {
    width: '100%',
    height: '100%'
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9' // Premium gray
  },
  bookButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  pageTitle: {
    fontSize: 28, // Larger for premium
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1e293b', // Darker blue-gray
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1e293b'
  },
  offerCard: {
    backgroundColor: '#fff',
    borderRadius: 16, // Rounded
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  driverName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1e293b'
  },
  offerPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
    marginVertical: 12
  },
  acceptBtn: {
    backgroundColor: '#4F46E5',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  driverHeader: {
    marginBottom: 20
  },
  driverHeaderTop: {
    alignItems: 'center',
    marginBottom: 12
  },
  driverHeaderButton: {
    alignItems: 'center'
  },
  statusBtn: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  statusBtnOnline: {
    backgroundColor: '#10b981'
  },
  statusBtnDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6
  },
  statusBtnText: {
    color: '#fff',
    fontWeight: 'bold'
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  tripRoute: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937'
  },
  tripArrow: {
    fontSize: 20,
    color: '#4F46E5', // Blue arrow
    textAlign: 'center',
    marginVertical: 4
  },
  tripPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
    marginVertical: 8
  },
  offerButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  offerButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  hint: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8
  },
  profilePhone: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 4
  },
  profileRole: {
    fontSize: 14,
    color: '#4F46E5', // Blue role
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  logoutBtn: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  activeTripContainer: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  statusBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  activeTripMap: {
    flex: 1
  },
  driverInfoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  driverInfoHeader: {
    marginBottom: 16
  },
  driverInfoName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4
  },
  driverInfoVehicle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4
  },
  driverInfoPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981'
  },
  routeInfo: {
    marginBottom: 16
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4
  },
  routePointIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    marginRight: 12
  },
  routePointIndicatorEnd: {
    backgroundColor: '#ef4444'
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#d1d5db',
    marginLeft: 5,
    marginVertical: 2
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: '#374151'
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  actionButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600'
  },
  sosButton: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626'
  },
  sosButtonText: {
    color: '#fff'
  },
  shareButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb'
  },
  shareButtonShared: {
    backgroundColor: '#10b981',
    borderColor: '#059669'
  },
  actionButtonDisabled: {
    opacity: 0.6
  },
  emergencyContactsBtn: {
    backgroundColor: '#4F46E5', // Blue
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  emergencyContactsBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  emergencyContactsContainer: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  infoCard: {
    backgroundColor: '#eff6ff', // Light blue glass
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8
  },
  helperText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12
  },
  emptyContactsText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  contactInfo: {
    flex: 1
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4
  },
  contactPhone: {
    fontSize: 14,
    color: '#6b7280'
  },
  deleteButton: {
    padding: 8
  },
  deleteButtonText: {
    fontSize: 20
  },
  addContactButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  addContactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f9fafb'
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalButtonCancel: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  modalButtonAdd: {
    backgroundColor: '#4F46E5'
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  modalButtonTextCancel: {
    color: '#374151'
  },
  modalButtonTextAdd: {
    color: '#fff'
  },
  // Fix for Comment 6: Removed duplicate ChatScreen and CallScreen styles - they are now co-located in their respective screen files
  // RatingScreen styles moved to screens/RatingScreen.js
  // Driver Active Trip Styles
  driverActiveTripContainer: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  driverStatusBar: {
    backgroundColor: '#fbbf24',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  driverStatusBarInProgress: {
    backgroundColor: '#10b981'
  },
  driverStatusBarCompleted: {
    backgroundColor: '#3b82f6'
  },
  driverStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff'
  },
  driverStatusSubtext: {
    fontSize: 14,
    color: '#fff',
    marginTop: 4,
    opacity: 0.9
  },
  driverMapContainer: {
    flex: 1
  },
  passengerInfoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5
  },
  passengerInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  passengerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4F46E5', // Blue avatar
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  passengerAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  passengerDetails: {
    flex: 1
  },
  passengerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4
  },
  tripRouteText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2
  },
  tripPriceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
    marginTop: 4
  },
  startTripButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  startTripButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  tripActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16
  },
  navigateButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  completeTripButton: {
    flex: 1,
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  completedIcon: {
    fontSize: 64,
    marginBottom: 20
  },
  completedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10b981',
    textAlign: 'center',
    marginBottom: 8
  },
  completedSubtext: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center'
  },
  // Driver Registration Status Banner Styles
  registrationBanner: {
    padding: 20,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  registrationBannerNotRegistered: {
    backgroundColor: '#fed7aa',
    borderLeftColor: '#9a3412'
  },
  registrationBannerPending: {
    backgroundColor: '#dbeafe',
    borderLeftColor: '#1e40af'
  },
  registrationBannerRejected: {
    backgroundColor: '#fee2e2',
    borderLeftColor: '#991b1b'
  },
  registrationBannerSuccess: {
    backgroundColor: '#d1fae5',
    borderLeftColor: '#047857'
  },
  registrationBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12
  },
  bannerIcon: {
    fontSize: 24,
    marginBottom: 8,
    textAlign: 'center'
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1f2937',
    textAlign: 'center'
  },
  bannerMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
    color: '#374151'
  },
  bannerTitleNotRegistered: {
    color: '#9a3412'
  },
  bannerTitlePending: {
    color: '#1e40af'
  },
  bannerTitleRejected: {
    color: '#991b1b'
  },
  bannerTitleSuccess: {
    color: '#047857'
  },
  bannerMessageNotRegistered: {
    color: '#9a3412'
  },
  bannerMessagePending: {
    color: '#1e40af'
  },
  bannerMessageRejected: {
    color: '#991b1b'
  },
  bannerMessageSuccess: {
    color: '#047857'
  },
  successBannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  successBannerIcon: {
    textAlign: 'left',
    marginBottom: 0
  },
  bannerCloseButton: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  bannerCloseButtonText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '600'
  },
  registrationButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  registrationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  // Verification Status Badge Styles
  verificationBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  verificationBadgePending: {
    backgroundColor: '#dbeafe'
  },
  verificationBadgeVerified: {
    backgroundColor: '#d1fae5'
  },
  verificationBadgeRejected: {
    backgroundColor: '#fee2e2'
  },
  verificationBadgeNotRegistered: {
    backgroundColor: '#fed7aa'
  },
  verificationBadgeText: {
    fontSize: 14,
    fontWeight: '600'
  },
  verificationBadgeTextPending: {
    color: '#1e40af'
  },
  verificationBadgeTextVerified: {
    color: '#065f46'
  },
  verificationBadgeTextRejected: {
    color: '#991b1b'
  },
  verificationBadgeTextNotRegistered: {
    color: '#9a3412'
  },
  buttonHelperText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4
  },
  // Dashboard Active Trip Banner Styles
  activeTripBanner: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#059669',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  activeTripBannerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8
  },
  activeTripBannerDetails: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 12
  },
  viewActiveTripButton: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  viewActiveTripButtonText: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600'
  },
  // Profile editing styles
  editButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  saveButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  saveButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.5
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  // Trip detail styles
  tripDetailContainer: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  tripDetailHeader: {
    backgroundColor: '#f9fafb',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  tripDetailId: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4
  },
  tripDetailDate: {
    fontSize: 12,
    color: '#9ca3af'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  statusBadgeCompleted: {
    backgroundColor: '#d1fae5'
  },
  statusBadgeInProgress: {
    backgroundColor: '#dbeafe'
  },
  statusBadgeAccepted: {
    backgroundColor: '#fef3c7'
  },
  statusBadgeRequested: {
    backgroundColor: '#f3f4f6'
  },
  statusBadgeCancelled: {
    backgroundColor: '#fee2e2'
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  statusTextCompleted: {
    color: '#065f46'
  },
  statusTextInProgress: {
    color: '#1e40af'
  },
  statusTextAccepted: {
    color: '#92400e'
  },
  statusTextRequested: {
    color: '#374151'
  },
  statusTextCancelled: {
    color: '#991b1b'
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  detailCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  participantAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4F46E5', // Blue
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  participantAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff'
  },
  participantDetails: {
    flex: 1
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2
  },
  participantMeta: {
    fontSize: 14,
    color: '#6b7280'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4
  },
  priceLabel: {
    fontSize: 14,
    color: '#6b7280'
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10b981'
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4F46E5', // Blue dot
    marginRight: 12,
    marginTop: 4
  },
  timelineContent: {
    flex: 1
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2
  },
  timelineTime: {
    fontSize: 12,
    color: '#6b7280'
  },
  ratingContainer: {
    alignItems: 'center',
    paddingVertical: 16
  },
  ratingStars: {
    flexDirection: 'row',
    marginBottom: 8
  },
  ratingStar: {
    fontSize: 24,
    marginHorizontal: 2
  },
  ratingComment: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic'
  },
  routeTextContainer: {
    flex: 1
  },
  routeTextLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 2
  },
  routeCoordinates: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2
  },
  // Admin dashboard styles
  adminContainer: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  adminTabs: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  adminTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  adminTabActive: {
    borderBottomColor: '#4F46E5' // Blue active
  },
  adminTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280'
  },
  adminTabTextActive: {
    color: '#4F46E5'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statCardAlert: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5'
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4
  },
  statNumberAlert: {
    color: '#dc2626'
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center'
  },
  driverVerificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  driverVerificationHeader: {
    marginBottom: 12
  },
  driverVerificationName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4
  },
  driverVerificationPhone: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8
  },
  driverVerificationInfo: {
    marginBottom: 12
  },
  driverVerificationLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2
  },
  driverVerificationValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500'
  },
  driverVerificationImages: {
    flexDirection: 'row',
    marginBottom: 12
  },
  driverVerificationImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginRight: 8
  },
  verificationActions: {
    flexDirection: 'row',
    marginTop: 8
  },
  verifyButton: {
    flex: 1,
    backgroundColor: '#10b981',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  verificationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  viewDetailsButton: {
    backgroundColor: '#3b82f6',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  viewDetailsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  driverDetailModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  driverDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  driverDetailSection: {
    marginBottom: 20
  },
  driverDetailPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8
  },
  driverDetailPhoto: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#e5e7eb'
  },
  photoItemContainer: {
    marginRight: 12,
    marginBottom: 12
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  photoLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '600'
  },
  fullscreenImageModal: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain'
  },
  closeImageButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
    padding: 10,
    zIndex: 1000
  },
  closeModalButton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sosEventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sosEventCardActive: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2'
  },
  sosEventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sosEventId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  sosEventStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600'
  },
  sosEventStatusActive: {
    backgroundColor: '#fee2e2',
    color: '#dc2626'
  },
  sosEventStatusResolved: {
    backgroundColor: '#d1fae5',
    color: '#065f46'
  },
  sosEventMessage: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8
  },
  sosEventMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4
  },
  sosEventActions: {
    flexDirection: 'row',
    marginTop: 12
  },
  sosEventButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  sosEventButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  // Trip history filter styles
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8
  },
  filterButtonActive: {
    backgroundColor: '#eef2ff', // Light blue
    borderColor: '#4F46E5'
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500'
  },
  filterButtonTextActive: {
    color: '#4F46E5',
    fontWeight: '600'
  },
  // Trip history card styles
  tripRouteContainer: {
    marginBottom: 12
  },
  tripRoutePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4
  },
  tripRouteIndicatorGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    marginRight: 12
  },
  tripRouteIndicatorRed: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    marginRight: 12
  },
  tripRouteSeparator: {
    fontSize: 20,
    color: '#4F46E5', // Blue separator
    textAlign: 'center',
    marginVertical: 4,
    marginLeft: 5
  },
  tripDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4
  },
  tripParticipant: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4
  },
  tripRating: {
    fontSize: 14,
    color: '#fbbf24',
    marginTop: 4
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  cancelTripButton: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626'
  },
  registrationButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  registrationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  }
});