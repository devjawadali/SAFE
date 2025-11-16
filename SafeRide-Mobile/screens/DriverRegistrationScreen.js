import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { api } from '../services/network';
import { buildNetworkErrorMessage } from '../utils/errors';
import { setUserData as setUserDataStorage, setDriverData, getUserData } from '../utils/storage';
import ImageUpload from '../components/ImageUpload';

export default function DriverRegistrationScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isSmallScreen = width <= 320;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  // Compute keyboardVerticalOffset for iOS: header height + safe area top inset
  const keyboardVerticalOffset = Platform.OS === 'ios' ? headerHeight + insets.top : 0;
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  
  // Image URIs
  const [licensePhoto, setLicensePhoto] = useState(null);
  const [vehiclePhoto, setVehiclePhoto] = useState(null);
  const [cnicPhoto, setCnicPhoto] = useState(null);

  useEffect(() => {
    const checkUserRole = async () => {
      const user = await getUserData();
      if (user && user.role !== 'driver') {
        Alert.alert('Access Denied', 'This screen is only for drivers.', [
          { text: 'OK', onPress: () => navigation.replace('Main') }
        ]);
      }
    };
    checkUserRole();
  }, [navigation]);

  const validateStep1 = () => {
    if (!licenseNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter your license number.');
      return false;
    }
    if (!vehicleMake.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle make.');
      return false;
    }
    if (!vehicleModel.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle model.');
      return false;
    }
    if (!vehiclePlate.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle plate number.');
      return false;
    }
    if (!vehicleYear.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle year.');
      return false;
    }
    const year = parseInt(vehicleYear.trim(), 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > currentYear) {
      Alert.alert('Validation Error', `Please enter a valid vehicle year between 1900 and ${currentYear}.`);
      return false;
    }
    return true;
  };

  /**
   * Helper function to check if a URI is a valid image URI (data URI or HTTP(S) URL)
   * @param {string} u - The URI to check
   * @returns {boolean} - True if the URI is a valid image URI
   */
  const isValidImageUri = (u) => {
    return Boolean(u && (u.startsWith('data:image/') || u.startsWith('http://') || u.startsWith('https://')));
  };

  const validateStep3 = () => {
    if (!licensePhoto) {
      Alert.alert('Validation Error', 'Please upload your license photo.');
      return false;
    }
    if (!vehiclePhoto) {
      Alert.alert('Validation Error', 'Please upload your vehicle photo.');
      return false;
    }
    if (!cnicPhoto) {
      Alert.alert('Validation Error', 'Please upload your CNIC photo.');
      return false;
    }
    // Validate image URI format (data URI or HTTP(S) URL)
    if (!isValidImageUri(licensePhoto)) {
      Alert.alert('Validation Error', 'License photo format is invalid. Please upload the image again.');
      return false;
    }
    if (!isValidImageUri(vehiclePhoto)) {
      Alert.alert('Validation Error', 'Vehicle photo format is invalid. Please upload the image again.');
      return false;
    }
    if (!isValidImageUri(cnicPhoto)) {
      Alert.alert('Validation Error', 'CNIC photo format is invalid. Please upload the image again.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep3()) {
      return;
    }

    setLoading(true);
    try {
      // Validate and parse vehicle year
      if (!vehicleYear.trim()) {
        Alert.alert('Validation Error', 'Please enter vehicle year.');
        setLoading(false);
        return;
      }
      const year = parseInt(vehicleYear.trim(), 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1900 || year > currentYear) {
        Alert.alert('Validation Error', `Please enter a valid vehicle year between 1900 and ${currentYear}.`);
        setLoading(false);
        return;
      }

      const payload = {
        license_number: licenseNumber.trim(),
        vehicle_make: vehicleMake.trim(),
        vehicle_model: vehicleModel.trim(),
        vehicle_plate: vehiclePlate.trim(),
        vehicle_year: year,
        vehicle_type: vehicleType,
        license_photo_url: licensePhoto,
        vehicle_photo_url: vehiclePhoto,
        cnic_photo_url: cnicPhoto,
      };

      const response = await api.post('/drivers/register', payload, { timeout: 30000 });
      
      // Update user data with driver information
      try {
        const userResponse = await api.get('/me');
        if (userResponse.data) {
          await setUserDataStorage(userResponse.data);
          // Store driver data separately for quick access
          if (userResponse.data.driver) {
            await setDriverData(userResponse.data.driver);
          }
        }
      } catch (error) {
        console.error('Error fetching updated user data:', error);
      }

      Alert.alert(
        'Registration Submitted',
        'Your registration has been submitted successfully! Please wait for admin verification before you can go online.',
        [
          {
            text: 'OK',
            onPress: () => navigation.replace('Main')
          }
        ]
      );
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = buildNetworkErrorMessage(error, 'Failed to submit registration');
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.scrollContent, isSmallScreen && styles.scrollContentSmall]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === 'ios' && { contentInsetAdjustmentBehavior: 'automatic' })}
      >
        <Text style={styles.pageTitle}>Driver Registration</Text>
        
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]}>
            <Text style={[styles.progressStepText, step >= 1 && styles.progressStepTextActive]}>1</Text>
          </View>
          <View style={[styles.progressLine, step >= 2 && styles.progressLineActive]} />
          <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]}>
            <Text style={[styles.progressStepText, step >= 2 && styles.progressStepTextActive]}>2</Text>
          </View>
          <View style={[styles.progressLine, step >= 3 && styles.progressLineActive]} />
          <View style={[styles.progressStep, step >= 3 && styles.progressStepActive]}>
            <Text style={[styles.progressStepText, step >= 3 && styles.progressStepTextActive]}>3</Text>
          </View>
        </View>

        {/* Step 1: Vehicle Details */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Vehicle Details</Text>
            
            <Text style={styles.label}>License Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your license number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
            />

            <Text style={styles.label}>Vehicle Make *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Toyota, Honda"
              value={vehicleMake}
              onChangeText={setVehicleMake}
            />

            <Text style={styles.label}>Vehicle Model *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Corolla, Civic"
              value={vehicleModel}
              onChangeText={setVehicleModel}
            />

            <Text style={styles.label}>Vehicle Plate Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., ABC-123"
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
            />

            <Text style={styles.label}>Vehicle Year *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 2020"
              value={vehicleYear}
              onChangeText={setVehicleYear}
              keyboardType="number-pad"
            />

            <TouchableOpacity style={styles.button} onPress={handleNext} disabled={loading}>
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Vehicle Type */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Select Vehicle Type</Text>
            
            <View style={[styles.roleContainer, isSmallScreen && styles.roleContainerSmall]}>
              <TouchableOpacity
                style={[styles.roleBtn, isSmallScreen && styles.roleBtnSmall, vehicleType === 'car' && styles.roleBtnActive]}
                onPress={() => setVehicleType('car')}
              >
                <Text style={[styles.roleText, vehicleType === 'car' && styles.roleTextActive]}>
                  Car
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, isSmallScreen && styles.roleBtnSmall, vehicleType === 'bike' && styles.roleBtnActive]}
                onPress={() => setVehicleType('bike')}
              >
                <Text style={[styles.roleText, vehicleType === 'bike' && styles.roleTextActive]}>
                  Bike
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, isSmallScreen && styles.roleBtnSmall, vehicleType === 'ev_bike' && styles.roleBtnActive]}
                onPress={() => setVehicleType('ev_bike')}
              >
                <Text style={[styles.roleText, vehicleType === 'ev_bike' && styles.roleTextActive]}>
                  EV Bike
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, styles.buttonInRow, styles.buttonSecondary]} onPress={handleBack} disabled={loading}>
                <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonInRow]} onPress={handleNext} disabled={loading}>
                <Text style={styles.buttonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Document Upload */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Upload Documents</Text>
            <Text style={styles.helperText}>
              Please upload clear photos of your documents. Admin verification is required before you can go online.
            </Text>

            {/* Driver documents use local mode to generate base64 data URIs
                which are stored directly in the database for atomic transactions
                and simplified backup/restore operations. */}
            {/* License Photo */}
            <ImageUpload
              label="License Photo *"
              imageUri={licensePhoto}
              onImageSelected={setLicensePhoto}
              uploadMode="local"
              maxSize={500 * 1024}
            />

            {/* Vehicle Photo */}
            <ImageUpload
              label="Vehicle Photo *"
              imageUri={vehiclePhoto}
              onImageSelected={setVehiclePhoto}
              uploadMode="local"
              maxSize={500 * 1024}
            />

            {/* CNIC Photo */}
            <ImageUpload
              label="CNIC Photo *"
              imageUri={cnicPhoto}
              onImageSelected={setCnicPhoto}
              uploadMode="local"
              maxSize={500 * 1024}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, styles.buttonInRow, styles.buttonSecondary]} onPress={handleBack} disabled={loading}>
                <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonInRow]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Submit Registration</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  scrollContentSmall: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#1e293b',
    textAlign: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  progressStep: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStepActive: {
    backgroundColor: '#4F46E5',
  },
  progressStepText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  progressStepTextActive: {
    color: '#fff',
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: '#4F46E5',
  },
  stepContainer: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1e293b',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    flexWrap: 'nowrap',
  },
  buttonInRow: {
    flex: 1,
    marginTop: 0,
    minWidth: 0,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  buttonTextSecondary: {
    color: '#4F46E5',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  roleContainerSmall: {
    flexDirection: 'column',
    gap: 12,
  },
  roleBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  roleBtnSmall: {
    flex: 0,
    width: '100%',
    minHeight: 50,
  },
  roleBtnActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#eef2ff',
  },
  roleText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
  roleTextActive: {
    color: '#4F46E5',
  },
  helperText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    lineHeight: 20,
  },
});

