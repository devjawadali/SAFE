import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { api } from '../services/network';

/**
 * Reusable ImageUpload component that handles image selection, preview, validation, and upload.
 * 
 * This component can upload images to the backend via multipart/form-data POST /upload endpoint
 * or return base64 data URIs for local processing.
 * It handles HEIC image conversion, size validation, resizing, and proper error handling.
 * 
 * @param {string} label - Display text for the upload area
 * @param {function} onImageSelected - Callback function receiving data URI URL from backend (server mode) or data URI string (local mode), or null when removed
 * @param {number} maxSize - Maximum file size in bytes (default: 5MB for server mode to match backend multer limit, 500KB for local mode to fit within backend 1MB request limit)
 * @param {string} imageUri - Optional controlled component pattern for image URI
 * @param {boolean} disabled - Optional boolean to disable the component
 * @param {boolean} allowsEditing - Whether to allow editing/cropping the image (default: false)
 * @param {[number, number]|null} aspect - Aspect ratio for cropping [width, height] (default: null, no forced aspect)
 * @param {string} uploadMode - Upload mode: 'server' (default) for backend upload, 'local' for base64 data URI
 */
export default function ImageUpload({
  label,
  onImageSelected,
  maxSize = null, // Will be set based on uploadMode if not provided
  imageUri = null,
  disabled = false,
  allowsEditing = false,
  aspect = null,
  uploadMode = 'server',
}) {
  // Set default maxSize based on uploadMode if not provided
  // Local mode: 500KB limit to ensure base64 payload fits within backend 1MB request body limit
  // Server mode: 5MB limit to match backend multer configuration
  const effectiveMaxSize = maxSize || (uploadMode === 'local' ? 500 * 1024 : 5 * 1024 * 1024);
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 320;
  
  const [selectedImage, setSelectedImage] = useState(imageUri);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Formats file size in bytes to a human-friendly string
   * Returns KB if size < 1MB, otherwise returns MB with one decimal place
   */
  const formatMaxSize = (sizeInBytes) => {
    if (sizeInBytes < 1024 * 1024) {
      return `${Math.round(sizeInBytes / 1024)}KB`;
    }
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Update internal state when imageUri prop changes (controlled component pattern)
  React.useEffect(() => {
    setSelectedImage(imageUri);
  }, [imageUri]);

  /**
   * Pick image from device media library
   * Handles permissions, image selection, HEIC conversion, format validation, size validation, and upload
   */
  const pickImage = async () => {
    if (disabled) return;

    try {
      setLoading(true);
      setError(null);

      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images.');
        setLoading(false);
        return;
      }

      // Launch image picker
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: allowsEditing,
        quality: 0.8,
        base64: false, // We'll read base64 ourselves if needed for local mode
      };
      if (aspect) {
        pickerOptions.aspect = aspect;
      }
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

      const didCancel = result.canceled || result.cancelled;
      if (!didCancel && result.assets?.[0]) {
        let asset = result.assets[0];
        let imageUri = asset.uri;
        let imageFormat = 'jpeg';
        let mimeType = 'image/jpeg';

        // Check if image is HEIC and convert to JPEG
        const isHEIC = asset.mimeType === 'image/heic' || 
                      asset.mimeType === 'image/heif' ||
                      asset.uri.toLowerCase().includes('.heic') ||
                      asset.uri.toLowerCase().includes('.heif');

        if (isHEIC) {
          try {
            // For local mode, combine HEIC conversion and resize into one operation for efficiency
            if (uploadMode === 'local') {
              const manipulatedImage = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 600, height: 600 } }], // Resize to 600x600 to fit within backend 1MB request limit
                {
                  compress: 0.8,
                  format: ImageManipulator.SaveFormat.JPEG,
                }
              );
              imageUri = manipulatedImage.uri;
              imageFormat = 'jpeg';
              mimeType = 'image/jpeg';

              // Check file size after conversion and resize
              const fileInfo = await FileSystem.getInfoAsync(imageUri);
              if (fileInfo.exists && fileInfo.size !== undefined) {
                if (fileInfo.size > effectiveMaxSize) {
                  Alert.alert('Image Too Large', `Image exceeds ${formatMaxSize(effectiveMaxSize)} limit. Please choose a smaller image.`);
                  setLoading(false);
                  return;
                }
              }
            } else {
              // Server mode: convert HEIC to JPEG and resize to keep file size under 5MB
              const manipulatedImage = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 1200, height: 1200 } }], // Resize to max 1200x1200 to keep under 5MB
                {
                  compress: 0.8,
                  format: ImageManipulator.SaveFormat.JPEG,
                }
              );
              imageUri = manipulatedImage.uri;
              imageFormat = 'jpeg';
              mimeType = 'image/jpeg';

              // Get reliable file size using expo-file-system
              const fileInfo = await FileSystem.getInfoAsync(imageUri);
              if (fileInfo.exists && fileInfo.size !== undefined) {
                if (fileInfo.size > effectiveMaxSize) {
                  Alert.alert('Image Too Large', `Image exceeds ${formatMaxSize(effectiveMaxSize)} limit. Please choose a smaller image.`);
                  setLoading(false);
                  return;
                }
              }
            }
          } catch (heicError) {
            console.error('Error converting HEIC image:', heicError);
            Alert.alert('Error', 'Failed to convert HEIC image. Please try again.');
            setLoading(false);
            return;
          }
        } else {
          // Extract image format from mime type or URI extension
          if (asset.mimeType) {
            if (asset.mimeType === 'image/png') {
              imageFormat = 'png';
              mimeType = 'image/png';
            } else if (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/jpg') {
              imageFormat = 'jpeg';
              mimeType = 'image/jpeg';
            }
          } else if (asset.uri) {
            const uriLower = asset.uri.toLowerCase();
            if (uriLower.includes('.png')) {
              imageFormat = 'png';
              mimeType = 'image/png';
            } else if (uriLower.includes('.jpg') || uriLower.includes('.jpeg')) {
              imageFormat = 'jpeg';
              mimeType = 'image/jpeg';
            }
          }

          // Validate image format (only JPEG/PNG allowed, matching backend validation)
          if (imageFormat !== 'jpeg' && imageFormat !== 'png') {
            Alert.alert('Invalid Format', 'Only JPEG and PNG images are allowed.');
            setLoading(false);
            return;
          }

          // Get reliable file size using expo-file-system
          const fileInfo = await FileSystem.getInfoAsync(imageUri);
          if (fileInfo.exists && fileInfo.size !== undefined) {
            if (fileInfo.size > effectiveMaxSize) {
              Alert.alert('Image Too Large', `Image exceeds ${formatMaxSize(effectiveMaxSize)} limit. Please choose a smaller image.`);
              setLoading(false);
              return;
            }
          }
        }

        // Handle local mode: resize (if not already resized for HEIC), convert to base64, and return data URI
        if (uploadMode === 'local') {
          try {
            // Resize image to constrain max dimensions (600x600) with compress 0.8 to fit within backend 1MB request limit
            // Note: HEIC images are already converted and resized above, so skip resize here
            let processedImageUri = imageUri;
            if (!isHEIC) {
              const resizeResult = await ImageManipulator.manipulateAsync(
                imageUri,
                [{ resize: { width: 600, height: 600 } }],
                {
                  compress: 0.8,
                  format: imageFormat === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
                }
              );
              processedImageUri = resizeResult.uri;
            }

            // Check file size after resize
            const resizedFileInfo = await FileSystem.getInfoAsync(processedImageUri);
            if (resizedFileInfo.exists && resizedFileInfo.size !== undefined) {
              if (resizedFileInfo.size > effectiveMaxSize) {
                Alert.alert('Image Too Large', `Image exceeds ${formatMaxSize(effectiveMaxSize)} limit after processing. Please choose a smaller image.`);
                setLoading(false);
                return;
              }
            }

            // Read image as base64
            const base64String = await FileSystem.readAsStringAsync(processedImageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Create data URI
            const dataUri = `data:${mimeType};base64,${base64String}`;

            // Update state and notify parent component with data URI
            setSelectedImage(dataUri);
            if (onImageSelected) {
              onImageSelected(dataUri);
            }
          } catch (localError) {
            console.error('Error processing image locally:', localError);
            setError('Failed to process image. Please try again.');
            Alert.alert('Error', 'Failed to process image. Please try again.');
          }
        } else {
          // Server mode: Create FormData for multipart upload
          const formData = new FormData();
          const filename = `image_${Date.now()}.${imageFormat}`;
          formData.append('image', {
            uri: imageUri,
            name: filename,
            type: mimeType,
          });

          // Upload image to backend
          try {
            const response = await api.post('/upload', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            // Backend returns { url: dataURI, filename, size, mimetype }
            const imageUrl = response.data.url;
            if (!imageUrl) {
              throw new Error('No image URL returned from server');
            }

            // Update state and notify parent component
            setSelectedImage(imageUrl);
            if (onImageSelected) {
              onImageSelected(imageUrl);
            }
          } catch (uploadError) {
            console.error('Error uploading image:', uploadError);
            const errorMessage = uploadError.response?.data?.error || uploadError.message || 'Failed to upload image. Please try again.';
            setError(errorMessage);
            Alert.alert('Upload Error', errorMessage);
          }
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setError('Failed to pick image. Please try again.');
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Remove selected image
   * Clears internal state and notifies parent component
   */
  const removeImage = () => {
    if (disabled) return;

    setSelectedImage(null);
    setError(null);
    if (onImageSelected) {
      onImageSelected(null);
    }
  };

  return (
    <View style={[styles.container, isSmallScreen && styles.containerSmall]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : selectedImage ? (
        <View style={styles.imagePreviewContainer}>
          <Image 
            source={{ uri: selectedImage }} 
            style={[styles.imagePreview, { height: isSmallScreen ? 150 : 200 }]}
            resizeMode="cover"
          />
          <TouchableOpacity
            style={[styles.removeImageButton, disabled && styles.disabledButton]}
            onPress={removeImage}
            disabled={disabled}
          >
            <Text style={styles.removeImageButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.imageUploadButton, 
            isSmallScreen && styles.imageUploadButtonSmall,
            disabled && styles.disabledButton
          ]}
          onPress={pickImage}
          disabled={disabled}
        >
          <Text style={styles.imageUploadButtonText}>Select Image</Text>
        </TouchableOpacity>
      )}
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  containerSmall: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  loadingContainer: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    minHeight: 100,
  },
  imageUploadButton: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  imageUploadButtonSmall: {
    padding: 16,
  },
  imageUploadButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
    resizeMode: 'cover',
  },
  removeImageButton: {
    backgroundColor: '#ef4444',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
});

