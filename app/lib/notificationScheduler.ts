import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  Card,
  Folder,
  getCardsData,
  loadCardsData,
  getCardScheduledTests,
  hasReviewTarget,
  isCardStudiedOnDate,
} from './cardsStore';

export type StudyNotificationSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

const SETTINGS_KEY = 'study_notification_settings';
export const STUDY_NOTIFICATION_KIND = 'study-reminder';
const CHANNEL_ID = 'study-reminders';
const DEFAULT_SETTINGS: StudyNotificationSettings = {
  enabled: false,
  hour: 20,
  minute: 0,
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getNotificationSettings(): Promise<StudyNotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<StudyNotificationSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      hour: clampHour(parsed.hour),
      minute: clampMinute(parsed.minute),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveNotificationSettings(settings: StudyNotificationSettings): Promise<void> {
  const next = {
    enabled: settings.enabled,
    hour: clampHour(settings.hour),
    minute: clampMinute(settings.minute),
  };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  await scheduleStudyNotificationBatch(next);
}

export async function scheduleStudyNotificationBatch(
  settings?: StudyNotificationSettings,
): Promise<void> {
  if (Platform.OS === 'web') return;

  const nextSettings = settings || (await getNotificationSettings());
  await cancelStudyNotifications();

  if (!nextSettings.enabled) return;

  const cards = await getAllCards();
  const notifications = buildNotificationBatch(cards, nextSettings);
  if (notifications.length === 0) return;

  const permission = await ensureNotificationPermission();
  if (!permission) return;

  await ensureAndroidNotificationChannel();

  for (const notification of notifications) {
    await Notifications.scheduleNotificationAsync(notification);
  }
}

export async function cancelStudyNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(item => item.content.data?.kind === STUDY_NOTIFICATION_KIND)
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '学習リマインダー',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function getAllCards(): Promise<Card[]> {
  await loadCardsData();
  return flattenCards(getCardsData());
}

function flattenCards(folders: Folder[]): Card[] {
  return folders.flatMap(folder => [
    ...folder.cards,
    ...flattenCards(folder.folders),
  ]);
}

function buildNotificationBatch(
  cards: Card[],
  settings: StudyNotificationSettings,
): Notifications.NotificationRequestInput[] {
  const now = new Date();
  const batch: Notifications.NotificationRequestInput[] = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const triggerDate = nextTriggerDate(now, settings.hour, settings.minute, offset);
    const dueCards = getCardsForDate(cards, triggerDate);
    const dueCount = dueCards.length;
    if (dueCount <= 0) continue;

    const trigger: Notifications.NotificationTriggerInput = Platform.OS === 'android'
      ? {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: CHANNEL_ID,
      }
      : {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      };

    batch.push({
      content: {
        title: '復習の時間です',
        body: `${dueCount}枚のカードを復習できます。`,
        sound: 'default',
        data: {
          kind: STUDY_NOTIFICATION_KIND,
          triggerAt: triggerDate.toISOString(),
          reviewDate: toLocalDateKey(triggerDate),
          dueCount,
        },
      },
      trigger,
    });
  }

  return batch;
}

function nextTriggerDate(now: Date, hour: number, minute: number, dayOffset: number): Date {
  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setHours(hour, minute, 0, 0);

  if (date.getTime() <= now.getTime()) {
    date.setDate(date.getDate() + 1);
  }

  date.setDate(date.getDate() + dayOffset);
  return date;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCardsForDate(cards: Card[], targetDate: Date): Card[] {
  const targetDateKey = toLocalDateKey(targetDate);

  return cards.filter(card => {
    if (!hasReviewTarget(card)) return false;

    // 当日の復習が完了済みなら通知対象から除外する
    if (isCardStudiedOnDate(card, targetDate)) return false;

    // 1. getCardScheduledTests による判定
    if (typeof getCardScheduledTests === 'function') {
      const schedules = getCardScheduledTests(card);
      if (schedules && schedules.length > 0) {
        if (schedules.some(schedule => schedule.dateKey === targetDateKey)) {
          return true;
        }
      }
    }

    // 2. nextTestTime による判定 (フォールバック)
    const nextTime = card.nextTestTime;
    if (nextTime !== undefined && !Number.isNaN(nextTime)) {
      const ms = nextTime < 1e11 ? nextTime * 1000 : nextTime;
      if (ms > 86400000) {
        const reviewDate = new Date(ms);
        if (!Number.isNaN(reviewDate.getTime())) {
          return toLocalDateKey(reviewDate) === targetDateKey;
        }
      }
    }

    return false;
  });
}

function clampHour(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_SETTINGS.hour;
  return Math.max(0, Math.min(23, Math.floor(numberValue)));
}

function clampMinute(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_SETTINGS.minute;
  return Math.max(0, Math.min(59, Math.floor(numberValue)));
}
