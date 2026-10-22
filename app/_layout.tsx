import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import 'react-native-reanimated';

import { ThemeProvider as CustomThemeProvider } from './lib/themeContext';
import { LanguageProvider } from './lib/languageContext';
import { loadCardsData } from './lib/cardsStore';
import { TutorialProvider } from './lib/tutorialContext';
import { TutorialModal } from '../components/TutorialModal';
import { checkAndApplyUpdates } from './lib/updateChecker';
import { recordAppLaunch } from './lib/achievementsStore';
import {
  scheduleStudyNotificationBatch,
  STUDY_NOTIFICATION_KIND,
} from './lib/notificationScheduler';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let isActive = true;
    let handledNotificationId: string | null = null;
    const cardsReady = loadCardsData();

    // 起動回数を記録
    void recordAppLaunch();

    cardsReady.then(() => {
      scheduleStudyNotificationBatch();
    });

    // 起動時およびアクティブ復帰時に最新アップデートを確認し自動リロード(Updates.reloadAsync)
    void checkAndApplyUpdates();

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void checkAndApplyUpdates();
      }
    });

    if (Platform.OS === 'web') {
      return () => {
        isActive = false;
      };
    }

    const openStudyNotification = async (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      const data = request.content.data;
      const reviewDate = data?.reviewDate;

      if (
        data?.kind !== STUDY_NOTIFICATION_KIND
        || typeof reviewDate !== 'string'
        || handledNotificationId === request.identifier
      ) {
        return;
      }

      handledNotificationId = request.identifier;
      await cardsReady;
      await Notifications.clearLastNotificationResponseAsync();

      if (!isActive) return;

      router.push(
        `/test?folderPath=${encodeURIComponent(JSON.stringify([]))}&includeSubfolders=true&date=${reviewDate}`
      );
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void openStudyNotification(response);
    });

    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        void openStudyNotification(response);
      }
    });

    return () => {
      isActive = false;
      subscription.remove();
      appStateSub.remove();
    };
  }, [router]);
  
  return (
    <LanguageProvider>
      <CustomThemeProvider>
        <ThemeProvider value={DefaultTheme}>
          <TutorialProvider>
            <Stack
              // すべての画面に共通のデフォルトを設定したい場合は、ここで指定
              screenOptions={{
                headerShown: false,
              }}
            >
              <Stack.Screen 
                name="(tabs)" 
                options={{
                  animation: 'simple_push',
                  presentation: "fullScreenModal"
                }} 
              />

              <Stack.Screen 
                name="settings" 
                options={{
                  animation: 'simple_push',
                }} 
              />

              <Stack.Screen 
                name="achievements" 
                options={{
                  animation: 'simple_push',
                }} 
              />

              <Stack.Screen 
                name="add" 
                options={{
                  animation: 'default',
                  animationDuration: 300,
                  presentation: 'card',
                }} 
              />

              <Stack.Screen
                name="importImage"
                options={{
                  animation: 'default',
                  animationDuration: 300,
                  presentation: 'card',
                }}
              />

              <Stack.Screen
                name="batchSelect"
                options={{
                  animation: 'simple_push',
                }} 
              />

              <Stack.Screen 
                name="selectFolder" 
                options={{
                  animation: 'slide_from_bottom',
                  presentation: 'modal',
                }} 
              />

              <Stack.Screen 
                name="testSettings" 
                options={{
                  animation: 'none',
                  presentation: 'card',
                }} 
              />

              <Stack.Screen 
                name="test" 
                options={{
                  animation: 'slide_from_right',
                  presentation: 'card',
                }} 
              />
            </Stack>
            <TutorialModal />
            <StatusBar style="auto" />
          </TutorialProvider>
        </ThemeProvider>
      </CustomThemeProvider>
    </LanguageProvider>
  );
}
