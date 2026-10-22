import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ScrollView, Keyboard, Platform, Image, Alert, Modal, Animated, Switch } from 'react-native';
import { getCard, updateCard, deleteCard, Card, CardImageFitMode } from '../lib/cardsStore';
import { boldWeight, shadow, TabBar, useColors } from '../lib/colors';
import { triggerHaptic } from '../lib/haptic';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '../lib/languageContext';
import { copyToClipboard } from '../lib/clipboard';
import { saveCardImage, resolveImageUri } from '../lib/cardImageHelper';

export default function EditCardScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ folderPath?: string; cardIndex?: string }>();
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
  const [memorizationLevel, setMemorizationLevel] = useState<number>(0);
  const [createdAt, setCreatedAt] = useState<string>('');
  const [rawCard, setRawCard] = useState<Card | null>(null);
  const [isValidCard, setIsValidCard] = useState(true);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const colors = useColors();

  const frontInputRef = useRef<TextInput>(null);
  const backInputRef = useRef<TextInput>(null);
  const memoInputRef = useRef<TextInput>(null);

  const currentCardJson = useMemo(() => {
    if (!rawCard) return '';
    return JSON.stringify(rawCard, null, 2);
  }, [rawCard]);

  const handleCopyJson = async () => {
    triggerHaptic();
    try {
      await copyToClipboard(currentCardJson);
      if (Platform.OS === 'web') {
        window.alert('JSONデータをクリップボードにコピーしました。');
      } else {
        Alert.alert('コピー完了', 'JSONデータをクリップボードにコピーしました。');
      }
    } catch (e) {
      console.error('Failed to copy JSON:', e);
    }
  };

  // どのフィールドがフォーカスされているかを管理
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const blurTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const folderPath = params.folderPath ? JSON.parse(params.folderPath as string) as string[] : [];
    const cardIndex = params.cardIndex ? parseInt(params.cardIndex as string, 10) : -1;
    const card = getCard(folderPath, cardIndex);

    if (!card) {
      setIsValidCard(false);
      return;
    }

    setRawCard(card);
    setFront(card.front);
    setBack(card.back);
    setMemo(card.memo);
    setFrontAscii(card.frontAscii || false);
    setBackAscii(card.backAscii || false);
    setMemoAscii(card.memoAscii || false);
    setFrontImage(card.frontImage);
    setBackImage(card.backImage);
    setFrontImageFitMode(card.frontImageFitMode || 'contain');
    setBackImageFitMode(card.backImageFitMode || 'contain');
    setMemorizationLevel(card.memorizationLevel);
    setCreatedAt(card.createdAt || new Date().toISOString());
    setIsValidCard(true);
  }, [params.folderPath, params.cardIndex]);

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
    blurTimeoutRef.current = setTimeout(() => {
      setFocusedField(null);
    }, 50);
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
    const folderPath = params.folderPath ? JSON.parse(params.folderPath as string) as string[] : [];
    const cardIndex = params.cardIndex ? parseInt(params.cardIndex as string, 10) : -1;
    if (cardIndex < 0) return;

    const originalCard = getCard(folderPath, cardIndex);
    if (!originalCard) return;

    const updatedCard: Card = {
      ...originalCard,
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
      createdAt: originalCard.createdAt,
      lastEdited: new Date().toISOString(),
      memorizationLevel: originalCard.memorizationLevel,
      objRememberTime: originalCard.objRememberTime,
      objStability: originalCard.objStability,
    };

    updateCard(folderPath, cardIndex, updatedCard);
    router.back();
  };

  const handleDelete = () => {
    triggerHaptic();
    const folderPath = params.folderPath ? JSON.parse(params.folderPath as string) as string[] : [];
    const cardIndex = params.cardIndex ? parseInt(params.cardIndex as string, 10) : -1;
    if (cardIndex < 0) return;

    const performDelete = () => {
      deleteCard(folderPath, cardIndex);
      router.back();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('deleteCardConfirm'))) {
        performDelete();
      }
    } else {
      Alert.alert(
        t('deleteCardTitle'),
        t('deleteCardConfirm'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('delete'), style: 'destructive', onPress: performDelete },
        ]
      );
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
    disabledInput: {
      opacity: 0.65,
      backgroundColor: colors.elementClicked,
    },
    disabledButton: {
      opacity: 0.35,
    },
    noticeContainer: {
      backgroundColor: colors.element,
      borderColor: colors.accentColor,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      ...shadow,
    },
    noticeText: {
      color: colors.titleText,
      fontSize: 13,
      textAlign: 'center',
      fontWeight: boldWeight,
    },
    buttonText: {
      fontWeight: boldWeight,
      color: 'white',
      fontSize: 16,
    },
    largeTextStyle: {
      fontSize: 32,
      color: "white",
      textAlign: "center",
    },
    screenWrapper: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topTabBar: {
      height: 48,
      backgroundColor: colors.element,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 15,
      ...shadow,
      zIndex: 10,
    },
    headerBackButton: {
      position: 'absolute',
      left: 15,
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: boldWeight,
      color: colors.titleText,
      textAlign: 'center',
    },
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
    },
    field: {
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 40,
      gap: 12,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.element,
      borderWidth: 1.5,
      borderColor: colors.lessAccentColor,
      paddingVertical: 14,
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
      flex: 1,
      backgroundColor: colors.element,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      ...shadow,
    },
    cancelButtonText: {
      fontWeight: boldWeight,
      color: colors.plainText,
      fontSize: 16,
    },
    deleteIconButton: {
      backgroundColor: colors.dangerBackground,
      borderColor: colors.dangerBorder,
      borderWidth: 1,
      width: 48,
      height: 48,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow,
    },
    infoIconButton: {
      backgroundColor: colors.element,
      borderColor: colors.divider,
      borderWidth: 1,
      width: 48,
      height: 48,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow,
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
    jsonModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    jsonModalContent: {
      width: '100%',
      maxWidth: 500,
      maxHeight: '85%',
      backgroundColor: colors.element,
      borderRadius: 15,
      padding: 20,
      ...shadow,
    },
    jsonModalTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    jsonScrollView: {
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      maxHeight: 350,
      flexShrink: 1,
      marginVertical: 12,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    jsonCodeText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 13,
      color: colors.titleText,
    },
    jsonModalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 6,
    },
    jsonModalButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.element,
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      ...shadow,
    },
    errorText: {
      fontSize: 16,
      color: '#900',
      marginBottom: 20,
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
  });

  if (!isValidCard) {
    return (
      <View style={styles.screenWrapper}>
        <TabBar />
        <View style={styles.topTabBar}>
          <Pressable
            onPress={handleCancel}
            style={styles.headerBackButton}
            accessibilityLabel={t('backButton')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.plainText} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('editCard')}</Text>
        </View>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.errorText}>{t('cardNotFound')}</Text>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>{t('backButton')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      {/* ダイナミックアイランド用領域 */}
      <TabBar />

      {/* 上のタブバー（ヘッダー） */}
      <View style={styles.topTabBar}>
        <Pressable
          onPress={handleCancel}
          style={styles.headerBackButton}
          accessibilityLabel={t('backButton')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.plainText} />
        </Pressable>
        <Text 
          style={styles.headerTitle}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {t('editCard')}
        </Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.field}>
          <Text style={styles.label}>{t('front')}</Text>
          <TextInput
            ref={frontInputRef}
            style={styles.input}
            value={front}
            multiline
            keyboardType={frontAscii ? (Platform.OS === 'ios' ? 'ascii-capable' : 'email-address') : 'default'}
            onFocus={() => handleFieldFocus('front')}
            onBlur={handleFieldBlur}
            selectionColor={colors.accentColor}
            onChangeText={setFront}
            placeholder={t('englishWordPlaceholder')}
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
            editable={true}
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
          <Pressable 
            style={styles.deleteIconButton} 
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </Pressable>
          <Pressable style={styles.infoIconButton} onPress={() => { triggerHaptic(); setShowJsonModal(true); }}>
            <Ionicons name="code-slash-outline" size={22} color={colors.plainText} />
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable 
            style={styles.saveButton} 
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>{t('save')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showJsonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJsonModal(false)}
      >
        <View style={styles.jsonModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowJsonModal(false)} />
          <View style={styles.jsonModalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.jsonModalTitle}>{t('cardDetailJson')}</Text>
              <Pressable onPress={() => setShowJsonModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close-outline" size={26} color={colors.plainText} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.jsonScrollView} nestedScrollEnabled={true} showsVerticalScrollIndicator>
              <Text style={styles.jsonCodeText} selectable>
                {currentCardJson}
              </Text>
            </ScrollView>

            <View style={styles.jsonModalButtonRow}>
              <Pressable style={styles.jsonModalButton} onPress={handleCopyJson}>
                <Ionicons name="copy-outline" size={18} color={colors.accentColor} />
                <Text style={{ color: colors.accentColor, fontWeight: boldWeight }}>{t('copyJson')}</Text>
              </Pressable>
              <Pressable style={[styles.jsonModalButton, { backgroundColor: colors.accentColor, borderColor: colors.accentColor }]} onPress={() => setShowJsonModal(false)}>
                <Text style={{ color: '#fff', fontWeight: boldWeight }}>{t('done')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    </View>
  );
}
