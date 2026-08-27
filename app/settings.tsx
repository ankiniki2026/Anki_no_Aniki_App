import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View, Alert, Linking, ScrollView } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { resetCardsData } from './lib/cardsStore';
import { boldWeight, shadow, useColors } from './lib/colors';
import { useTheme } from './lib/themeContext';
import { useLanguage, Language } from './lib/languageContext';
import { triggerHaptic } from './lib/haptic';
import {
  getNotificationSettings,
  saveNotificationSettings,
  StudyNotificationSettings,
} from './lib/notificationScheduler';

import { getDeviceUuid } from './lib/deviceUuid';
import { copyToClipboard } from './lib/clipboard';
import { checkAndApplyUpdates } from './lib/updateChecker';

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const colors = useColors();
  const [modalVisible, setModalVisible] = useState(false);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [notificationSettings, setNotificationSettings] = useState<StudyNotificationSettings>({
    enabled: false,
    hour: 20,
    minute: 0,
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showWebUnsupportedMessage, setShowWebUnsupportedMessage] = useState(false);

  const languages: { label: string; value: Language }[] = [
    { label: '日本語', value: 'ja' },
    { label: 'English', value: 'en' },
    { label: 'Français', value: 'fr' },
    { label: 'Suomi', value: 'fi' },
  ];

  const currentLanguageLabel = languages.find(l => l.value === language)?.label || '日本語';
  const notificationTimeText = `${String(notificationSettings.hour).padStart(2, '0')}:${String(notificationSettings.minute).padStart(2, '0')}`;
  const notificationDate = new Date();
  notificationDate.setHours(notificationSettings.hour, notificationSettings.minute, 0, 0);
  const isWebNotificationUnsupported = Platform.OS === 'web';
  const canEditNotifications = !isWebNotificationUnsupported && notificationSettings.enabled;

  useEffect(() => {
    getNotificationSettings().then(setNotificationSettings);
    getDeviceUuid().then(setDeviceUuid);
  }, []);

  const updateNotifications = async (next: StudyNotificationSettings) => {
    triggerHaptic();
    setNotificationSettings(next);
    await saveNotificationSettings(next);
  };

  const toggleNotifications = (enabled: boolean) => {
    if (isWebNotificationUnsupported) {
      showWebNotificationUnsupportedMessage();
      return;
    }
    updateNotifications({ ...notificationSettings, enabled });
  };

  const showWebNotificationUnsupportedMessage = () => {
    setShowWebUnsupportedMessage(true);
    setTimeout(() => setShowWebUnsupportedMessage(false), 1200);
  };

  const openNotificationTimePicker = () => {
    if (isWebNotificationUnsupported) {
      showWebNotificationUnsupportedMessage();
      return;
    }
    if (!canEditNotifications) return;
    triggerHaptic();
    setShowTimePicker(true);
  };

  const changeNotificationTime = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (event.type === 'dismissed' || !selectedDate) return;

    updateNotifications({
      ...notificationSettings,
      hour: selectedDate.getHours(),
      minute: selectedDate.getMinutes(),
    });
  };

  const handleResetData = () => {
    triggerHaptic();
    const confirmReset = () => {
      resetCardsData().then(() => {
        if (Platform.OS === 'web') {
          window.alert(t('resetDataSuccess'));
        } else {
          Alert.alert(t('resetData'), t('resetDataSuccess'));
        }
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('resetDataConfirm'))) {
        confirmReset();
      }
    } else {
      Alert.alert(
        t('resetData'),
        t('resetDataConfirm'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('resetData'), style: 'destructive', onPress: confirmReset },
        ]
      );
    }
  };

  const handleResetApp = () => {
    triggerHaptic();
    const confirmResetApp = async () => {
      await AsyncStorage.clear();
      await resetCardsData();
      if (Platform.OS === 'web') {
        window.alert(t('resetAppSuccess'));
      } else {
        Alert.alert(t('resetApp'), t('resetAppSuccess'));
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('resetAppConfirm'))) {
        confirmResetApp();
      }
    } else {
      Alert.alert(
        t('resetApp'),
        t('resetAppConfirm'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('resetApp'), style: 'destructive', onPress: confirmResetApp },
        ]
      );
    }
  };

  const handleOpenContactForm = () => {
    triggerHaptic();
    const contactUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfsckn4LMjecZsscP82nkd0eZFmULgEuqWAL9b7LlMuNpYByg/viewform';
    Linking.openURL(contactUrl).catch((err) => {
      console.error('Failed to open contact form:', err);
    });
  };

  const handleCopyUuid = async () => {
    if (!deviceUuid) return;
    triggerHaptic();
    try {
      await copyToClipboard(deviceUuid);
      if (Platform.OS === 'web') {
        window.alert('端末UUIDをクリップボードにコピーしました。');
      } else {
        Alert.alert('コピー完了', '端末UUIDをクリップボードにコピーしました。');
      }
    } catch (e) {
      console.error('Failed to copy UUID:', e);
    }
  };

  const styles = StyleSheet.create({
    title: {
      fontWeight: boldWeight,
      fontSize: 24,
      marginBottom: 20,
    },
    label: {
      fontWeight: boldWeight,
      fontSize: 18,
      color: colors.titleText,
      flexShrink: 1,
    },
    settingsContainer: {
      flex: 1,
      backgroundColor: colors.background,
      position: 'relative',
    },
    settingContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 15,
      marginBottom: 10,
      borderRadius: 10,
      backgroundColor: colors.element,
      flexWrap: 'wrap',
      gap: 10,
      ...shadow,
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.divider,
      minWidth: 120,
    },
    dropdownText: {
      fontSize: 16,
      color: colors.titleText,
      marginRight: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      width: '80%',
      backgroundColor: colors.element,
      borderRadius: 15,
      padding: 10,
      ...shadow,
    },
    modalItem: {
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    modalItemText: {
      fontSize: 18,
      color: colors.titleText,
      textAlign: 'center',
    },
    lastModalItem: {
      borderBottomWidth: 0,
    },
    timeControls: {
      alignItems: 'center',
      flexDirection: 'row',
    },
    webNotice: {
      ...shadow,
      alignSelf: 'center',
      backgroundColor: colors.element,
      borderColor: colors.divider,
      borderRadius: 8,
      borderWidth: 1,
      elevation: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      position: 'absolute',
      top: 12,
      zIndex: 20,
    },
    webNoticeText: {
      color: colors.titleText,
      fontSize: 15,
      fontWeight: boldWeight,
    },
    timePickerTrigger: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.divider,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 116,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    disabledControl: {
      opacity: 0.45,
    },
    timePickerContent: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
    },
    timeText: {
      color: colors.titleText,
      fontSize: 20,
      fontWeight: boldWeight,
      minWidth: 62,
      textAlign: 'center',
    },
    timePickerPanel: {
      alignItems: 'center',
      backgroundColor: colors.element,
      borderColor: colors.divider,
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 10,
      width: '86%',
      ...shadow,
    },
    timePickerDoneButton: {
      alignItems: 'center',
      backgroundColor: colors.accentColor,
      borderRadius: 6,
      marginTop: 8,
      paddingHorizontal: 18,
      paddingVertical: 8,
    },
    timePickerDoneText: {
      color: '#fff',
      fontWeight: boldWeight,
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      borderColor: colors.dangerBorder,
      borderWidth: 1,
      borderRadius: 5,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.dangerBackground,
      marginLeft: 'auto',
    },
    resetButtonText: {
      fontSize: 16,
      fontWeight: boldWeight,
      color: colors.danger,
    },
    contactButton: {
      flexDirection: 'row',
      alignItems: 'center',
      borderColor: colors.divider,
      borderWidth: 1,
      borderRadius: 5,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.background,
      marginLeft: 'auto',
    },
    contactButtonText: {
      fontSize: 16,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
  });

  return (<>
      <View style={{height: 48, backgroundColor: colors.element, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.divider}}>
        <Pressable 
          onPress={() => { triggerHaptic(); router.push('/'); }}
        >
          <Text style={styles.label}>{t('settings')}</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.settingsContainer} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={true}>
        {showWebUnsupportedMessage && (
          <View pointerEvents="none" style={styles.webNotice}>
            <Text style={styles.webNoticeText}>{t('webUnsupported')}</Text>
          </View>
        )}

        <View style={styles.settingContainer}>
          <Text style={[styles.label]}>{t('darkMode')}</Text>
          <Switch
            value={theme === 'dark'}
            onValueChange={() => { triggerHaptic(); toggleTheme(); }}
            trackColor={{ false: '#767577', true: colors.accentColor }}
            thumbColor={theme === 'dark' ? '#f4f3f4' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('language')}</Text>
          <Pressable 
            style={styles.dropdownTrigger}
            onPress={() => { triggerHaptic(); setModalVisible(true); }}
          >
            <Text style={styles.dropdownText}>{currentLanguageLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.plainText} />
          </Pressable>
        </View>

        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('notifications')}</Text>
          {isWebNotificationUnsupported ? (
            <Pressable onPress={showWebNotificationUnsupportedMessage}>
              <View pointerEvents="none">
                <Switch
                  value={false}
                  disabled
                  style={styles.disabledControl}
                  trackColor={{ false: '#767577', true: colors.accentColor }}
                  thumbColor="#f4f3f4"
                />
              </View>
            </Pressable>
          ) : (
            <Switch
              value={notificationSettings.enabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#767577', true: colors.accentColor }}
              thumbColor="#f4f3f4"
            />
          )}
        </View>

        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('notificationTime')}</Text>
          <View style={styles.timeControls}>
            <Pressable
              style={[
                styles.timePickerTrigger,
                !canEditNotifications && styles.disabledControl,
              ]}
              onPress={isWebNotificationUnsupported ? showWebNotificationUnsupportedMessage : openNotificationTimePicker}
              disabled={!isWebNotificationUnsupported && !canEditNotifications}
            >
              <View style={styles.timePickerContent}>
                <Ionicons name="time-outline" size={20} color={colors.plainText} />
                <Text style={styles.timeText}>{notificationTimeText}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.plainText} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('resetData')}</Text>
          <Pressable 
            style={styles.resetButton}
            onPress={handleResetData}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.danger} style={{ marginRight: 2 }} />
            <Text style={styles.resetButtonText}>{t('resetData')}</Text>
          </Pressable>
        </View>


        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('appUpdate')}</Text>
          <Pressable 
            style={styles.contactButton}
            onPress={() => {
              triggerHaptic();
              void checkAndApplyUpdates(true, t);
            }}
          >
            <Ionicons name="cloud-download-outline" size={20} color={colors.accentColor} style={{ marginRight: 6 }} />
            <Text style={styles.contactButtonText}>{t('checkLatestVersion')}</Text>
          </Pressable>
        </View>

        {/* <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('resetApp')}</Text>
          <Pressable 
            style={styles.resetButton}
            onPress={handleResetApp}
          >
            <Ionicons name="trash-bin-outline" size={20} color={colors.danger} style={{ marginRight: 2 }} />
            <Text style={styles.resetButtonText}>{t('resetApp')}</Text>
          </Pressable>
        </View> */}

        <View style={styles.settingContainer}>
          <Text style={styles.label}>{t('contactForm')}</Text>
          <Pressable 
            style={styles.contactButton}
            onPress={handleOpenContactForm}
          >
            <Ionicons name="mail-outline" size={20} color={colors.accentColor} style={{ marginRight: 6 }} />
            <Text style={styles.contactButtonText}>{t('contactForm')}</Text>
            <Ionicons name="open-outline" size={16} color={colors.plainText} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>

        <Pressable 
          style={{ marginTop: 20, marginBottom: 15, alignItems: 'center' }}
          onPress={handleCopyUuid}
        >
          <Text style={{ fontSize: 13, color: colors.plainText, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
            UUID: {deviceUuid || '...'}
          </Text>
        </Pressable>

        {!isWebNotificationUnsupported && showTimePicker && Platform.OS === 'ios' && (
          <Modal
            animationType="fade"
            transparent
            presentationStyle="overFullScreen"
            visible={showTimePicker}
            onRequestClose={() => setShowTimePicker(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowTimePicker(false)}
            >
              <Pressable
                style={styles.timePickerPanel}
                onPress={event => event.stopPropagation()}
              >
                <DateTimePicker
                  value={notificationDate}
                  mode="time"
                  display="spinner"
                  is24Hour
                  onChange={changeNotificationTime}
                />
                <Pressable
                  style={styles.timePickerDoneButton}
                  onPress={() => {
                    triggerHaptic();
                    setShowTimePicker(false);
                  }}
                >
                  <Text style={styles.timePickerDoneText}>{t('done')}</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {!isWebNotificationUnsupported && showTimePicker && Platform.OS !== 'ios' && (
            <DateTimePicker
              value={notificationDate}
              mode="time"
              display="default"
              is24Hour
              onChange={changeNotificationTime}
            />
        )}

        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => { triggerHaptic(); setModalVisible(false); }}
          >
            <View style={styles.modalContent}>
              {languages.map((item, index) => (
                <Pressable
                  key={item.value}
                  style={[
                    styles.modalItem,
                    index === languages.length - 1 && styles.lastModalItem,
                    language === item.value && { backgroundColor: colors.background + '80' }
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setLanguage(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    language === item.value && { fontWeight: 'bold', color: colors.accentColor }
                  ]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

      </ScrollView>
  </>);

}
