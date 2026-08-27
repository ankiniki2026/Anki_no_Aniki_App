import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ScrollView, Keyboard, Platform, Image, Modal, Alert, Animated, Switch } from 'react-native';
import { addCard, Card, CardImageFitMode, generateUUID } from './lib/cardsStore';
import { boldWeight, shadow, TabBar, useColors } from './lib/colors';
import { triggerHaptic } from './lib/haptic';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from './lib/languageContext';
import { saveCardImage, resolveImageUri } from './lib/cardImageHelper';

export default function AddCardScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ folderPath?: string }>();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [memo, setMemo] = useState('');
  const [frontAscii, setFrontAscii] = useState(false);
  const [backAscii, setBackAscii] = useState(false);
  const [memoAscii, setMemoAscii] = useState(false);
  const [frontImage, setFrontImage] = useState<string | undefined>(undefined);
  const [backImage, setBackImage] = useState<string | undefined>(undefined);
  const [frontImageFitMode, setFrontImageFitMode] = useState<CardImageFitMode>('contain');
  const [backImageFitMode, setBackImageFitMode] = useState<CardImageFitMode>('contain');
  const colors = useColors();

  const frontInputRef = useRef<TextInput>(null);
  const backInputRef = useRef<TextInput>(null);
  const memoInputRef = useRef<TextInput>(null);

  // どのフィールドがフォーカスされているかを管理
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const blurTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? Math.min(e.duration || 90, 90) : 80,
        useNativeDriver: false,
      }).start();
    });

    const hideSubscription = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? Math.min(e.duration || 100, 100) : 90,
        useNativeDriver: false,
      }).start(() => {
        setFocusedField(null);
      });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleFieldFocus = (field: string) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFocusedField(field);
  };

  const handleFieldBlur = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  };

  const handlePrevField = () => {
    triggerHaptic();
    if (focusedField === 'back') {
      frontInputRef.current?.focus();
    } else if (focusedField === 'memo') {
      backInputRef.current?.focus();
    }
  };

  const handleNextField = () => {
    triggerHaptic();
    if (focusedField === 'front') {
      backInputRef.current?.focus();
    } else if (focusedField === 'back') {
      memoInputRef.current?.focus();
    }
  };

  const handleDone = () => {
    triggerHaptic();
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    setFocusedField(null);
    Keyboard.dismiss();
  };

  const handlePickImage = async (target: 'front' | 'back') => {
    triggerHaptic();
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert(t('photoPermissionRequired'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      const savedUri = await saveCardImage(selectedUri, target);
      if (target === 'front') setFrontImage(savedUri);
      else setBackImage(savedUri);
    }
  };

  const handleSave = () => {
    triggerHaptic();
    if (!front || !back) return; // 表面と裏面は必須とする

    const folderPath = params.folderPath ? JSON.parse(params.folderPath as string) as string[] : [];
    
    const newCard: Card = {
      uuid: generateUUID(),
      front,
      back,
      memo,
      frontImage,
      backImage,
      frontImageFitMode,
      backImageFitMode,
      frontAscii,
      backAscii,
      memoAscii,
      createdAt: new Date().toISOString(),
      lastEdited: new Date().toISOString(),
      memorizationLevel: 0,
      objRememberTime: 0,
      objStability: 133,
    };

    const success = addCard(folderPath, newCard);
    if (success) {
      setFront('');
      setBack('');
      setMemo('');
      setFrontAscii(false);
      setBackAscii(false);
      setMemoAscii(false);
      setFrontImage(undefined);
      setBackImage(undefined);
      setFrontImageFitMode('contain');
      setBackImageFitMode('contain');
      frontInputRef.current?.focus();
    } else {
      console.error("Failed to add card. Folder path might be invalid.");
    }
  };

  const handleCancel = () => {
    triggerHaptic();
    router.back();
  };

  const styles = StyleSheet.create({
    label: {
      fontSize: 10,
      margin: 2,
      color: colors.titleText,
      fontWeight: boldWeight
    },
    input: {
      backgroundColor: colors.element,
      color: colors.titleText,
      fontWeight: boldWeight,
      borderColor: colors.plainText,
      borderRadius: 5,
      padding: 3,
      fontSize: 20,
      minHeight: 40,
      ...shadow
    },
    memoInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    buttonText: {
      fontWeight: boldWeight,
      color: 'white',
      fontSize: 16,
    },
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
    },
    field: {
      marginBottom: 16,
    },
    fieldControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      gap: 10,
      flexWrap: 'wrap',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.element,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 6,
      ...shadow,
    },
    toggleLabel: {
      fontSize: 13,
      fontWeight: boldWeight,
      color: colors.plainText,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 40,
    },
    saveButton: {
      backgroundColor: colors.element,
      borderWidth: 1.5,
      borderColor: colors.lessAccentColor,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      ...shadow,
    },
    saveButtonText: {
      fontWeight: boldWeight,
      color: colors.lessAccentColor,
      fontSize: 16,
    },
    cancelButton: {
      backgroundColor: colors.element,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      ...shadow,
    },
    cancelButtonText: {
      fontWeight: boldWeight,
      color: colors.plainText,
      fontSize: 16,
    },
    accessoryBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
    },
    accessoryBar: {
      height: 52,
      backgroundColor: colors.element,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      ...shadow,
    },
    arrowGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    disabledButton: {
      opacity: 0.35,
    },
    doneButton: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: colors.accentColor + '20',
      borderWidth: 1,
      borderColor: colors.accentColor + '40',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addImageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.element,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    addImageButtonText: {
      fontSize: 14,
      color: colors.lessAccentColor,
      marginLeft: 6,
      fontWeight: '600',
    },
    imagePreviewContainer: {
      position: 'relative',
      marginTop: 8,
      width: 150,
      height: 150,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.divider,
    },
    imagePreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    imageRemoveButton: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      borderRadius: 12,
    },
    modeToggleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 6,
      flexWrap: 'wrap',
    },
    modeToggleLabel: {
      fontSize: 12,
      fontWeight: boldWeight,
      color: colors.plainText,
      marginRight: 2,
    },
    modeToggleButton: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.element,
      ...shadow,
    },
    modeToggleButtonActive: {
      borderColor: colors.accentColor,
      backgroundColor: colors.accentColor,
    },
    modeToggleText: {
      fontSize: 12,
      color: colors.plainText,
      fontWeight: boldWeight,
    },
    modeToggleTextActive: {
      color: '#fff',
    },
    csvImportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.element,
      borderWidth: 1.5,
      borderColor: colors.accentColor,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 8,
      ...shadow,
    },
    csvImportButtonText: {
      fontSize: 15,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 500,
      backgroundColor: colors.element,
      borderRadius: 12,
      padding: 20,
      ...shadow,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    modalInstruction: {
      fontSize: 13,
      color: colors.plainText,
      marginBottom: 12,
      lineHeight: 18,
    },
    csvTextInput: {
      backgroundColor: colors.background,
      color: colors.titleText,
      fontSize: 14,
      borderRadius: 8,
      padding: 12,
      minHeight: 180,
      maxHeight: 300,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: colors.divider,
      marginBottom: 20,
    },
    modalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TabBar/>

      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.field}>
          <Text style={styles.label}>{t('front')}</Text>
          <TextInput
            ref={frontInputRef}
            style={styles.input}
            value={front}
            multiline
            autoFocus={true}
            keyboardType={frontAscii ? (Platform.OS === 'ios' ? 'ascii-capable' : 'email-address') : 'default'}
            onFocus={() => handleFieldFocus('front')}
            onBlur={handleFieldBlur}
            selectionColor={colors.accentColor}
            onChangeText={setFront}
            placeholder="e.g. English text here"
            placeholderTextColor={colors.element}
          />
          <View style={styles.fieldControlsRow}>
            {frontImage ? (
              <View style={{ flex: 1 }}>
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: resolveImageUri(frontImage) }} style={styles.imagePreview} />
                  <Pressable style={styles.imageRemoveButton} onPress={() => setFrontImage(undefined)}>
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </Pressable>
                </View>
                <View style={styles.modeToggleContainer}>
                  <Pressable 
                    style={[styles.modeToggleButton, frontImageFitMode === 'contain' && styles.modeToggleButtonActive]} 
                    onPress={() => { triggerHaptic(); setFrontImageFitMode('contain'); }}
                  >
                    <Text style={[styles.modeToggleText, frontImageFitMode === 'contain' && styles.modeToggleTextActive]}>
                      {t('imageFitContain')}
                    </Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.modeToggleButton, frontImageFitMode === 'fullWidth' && styles.modeToggleButtonActive]} 
                    onPress={() => { triggerHaptic(); setFrontImageFitMode('fullWidth'); }}
                  >
                    <Text style={[styles.modeToggleText, frontImageFitMode === 'fullWidth' && styles.modeToggleTextActive]}>
                      {t('imageFitFullWidth')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.addImageButton} onPress={() => handlePickImage('front')}>
                <Ionicons name="image-outline" size={20} color={colors.accentColor} />
                <Text style={styles.addImageButtonText}>{t('addImageFront')}</Text>
              </Pressable>
            )}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('asciiOnly')}</Text>
              <Switch
                value={frontAscii}
                onValueChange={(val) => { triggerHaptic(); setFrontAscii(val); }}
                trackColor={{ false: '#767577', true: colors.accentColor }}
                thumbColor="#f4f3f4"
              />
            </View>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('back')}</Text>
          <TextInput
            ref={backInputRef}
            style={styles.input}
            value={back}
            multiline
            keyboardType={backAscii ? (Platform.OS === 'ios' ? 'ascii-capable' : 'email-address') : 'default'}
            onFocus={() => handleFieldFocus('back')}
            onBlur={handleFieldBlur}
            selectionColor={colors.accentColor}
            onChangeText={setBack}
            placeholder="例えば、日本語のテキストをここに入力"
            placeholderTextColor={colors.element}
          />
          <View style={styles.fieldControlsRow}>
            {backImage ? (
              <View style={{ flex: 1 }}>
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: resolveImageUri(backImage) }} style={styles.imagePreview} />
                  <Pressable style={styles.imageRemoveButton} onPress={() => setBackImage(undefined)}>
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </Pressable>
                </View>
                <View style={styles.modeToggleContainer}>
                  <Pressable 
                    style={[styles.modeToggleButton, backImageFitMode === 'contain' && styles.modeToggleButtonActive]} 
                    onPress={() => { triggerHaptic(); setBackImageFitMode('contain'); }}
                  >
                    <Text style={[styles.modeToggleText, backImageFitMode === 'contain' && styles.modeToggleTextActive]}>
                      {t('imageFitContain')}
                    </Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.modeToggleButton, backImageFitMode === 'fullWidth' && styles.modeToggleButtonActive]} 
                    onPress={() => { triggerHaptic(); setBackImageFitMode('fullWidth'); }}
                  >
                    <Text style={[styles.modeToggleText, backImageFitMode === 'fullWidth' && styles.modeToggleTextActive]}>
                      {t('imageFitFullWidth')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.addImageButton} onPress={() => handlePickImage('back')}>
                <Ionicons name="image-outline" size={20} color={colors.accentColor} />
                <Text style={styles.addImageButtonText}>{t('addImageBack')}</Text>
              </Pressable>
            )}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('asciiOnly')}</Text>
              <Switch
                value={backAscii}
                onValueChange={(val) => { triggerHaptic(); setBackAscii(val); }}
                trackColor={{ false: '#767577', true: colors.accentColor }}
                thumbColor="#f4f3f4"
              />
            </View>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('memo')}</Text>
          <TextInput
            ref={memoInputRef}
            style={styles.input}
            value={memo}
            onFocus={() => handleFieldFocus('memo')}
            onBlur={handleFieldBlur}
            selectionColor={colors.accentColor}
            onChangeText={setMemo}
            multiline
            keyboardType={memoAscii ? (Platform.OS === 'ios' ? 'ascii-capable' : 'email-address') : 'default'}
          />
          <View style={[styles.fieldControlsRow, { justifyContent: 'flex-end' }]}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('asciiOnly')}</Text>
              <Switch
                value={memoAscii}
                onValueChange={(val) => { triggerHaptic(); setMemoAscii(val); }}
                trackColor={{ false: '#767577', true: colors.accentColor }}
                thumbColor="#f4f3f4"
              />
            </View>
          </View>
        </View>
        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>{t('saveAndNext')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {!!focusedField && (Platform.OS === 'ios' || Platform.OS === 'android') && (
        <Animated.View
          style={[styles.accessoryBarContainer, { bottom: keyboardHeight }]}
        >
          <View style={styles.accessoryBar}>
            <View style={styles.arrowGroup}>
              <Pressable 
                style={[styles.iconButton, focusedField === 'front' && styles.disabledButton]} 
                onPress={handlePrevField}
                disabled={focusedField === 'front'}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-up" size={28} color={focusedField === 'front' ? colors.plainText + '40' : colors.accentColor} />
              </Pressable>
              <Pressable 
                style={[styles.iconButton, focusedField === 'memo' && styles.disabledButton]} 
                onPress={handleNextField}
                disabled={focusedField === 'memo'}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-down" size={28} color={focusedField === 'memo' ? colors.plainText + '40' : colors.accentColor} />
              </Pressable>
            </View>
            <Pressable 
              style={styles.doneButton} 
              onPress={handleDone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="checkmark-done" size={28} color={colors.accentColor} />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </>
  );
}
