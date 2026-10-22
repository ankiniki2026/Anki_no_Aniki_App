import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useColors } from '../lib/colors';
import { useLanguage } from '../lib/languageContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = useColors();
  const { t } = useLanguage();
  const showTabBar = true; // T/Fで表示/非表示を切り替え

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { 
          display: showTabBar ? 'flex' : 'none',
          backgroundColor: colors.element,
          borderTopColor: colors.divider,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: t('cards'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="rectangle.stack.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="testScreen"
        options={{
          title: t('testHeader'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="edit"
        options={{
          title: t('editCard'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('calendarTab'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="graph"
        options={{
          title: t('graphTab'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: t('sharedFolders'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="folder.badge.plus" color={color} />,
        }}
      />
    </Tabs>
  );
}
