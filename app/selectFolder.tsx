import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  Pressable,
  FlatList,
  StyleSheet,
  Text,
  View,
  Platform,
  Alert
} from 'react-native';
import { triggerHaptic } from './lib/haptic';
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  Easing
} from 'react-native-reanimated';
import {
  createFolderList,
  findCurrentFoldersData,
  Folder,
  getCardsData
} from './lib/cardsStore';
import { boldWeight, shadow, useColors } from './lib/colors';
import { TabBar } from './lib/colors';
import { useLanguage } from './lib/languageContext';

export default function SelectFolderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useLanguage();

  const [currentFolder, setCurrentFolder] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string[]>([]);
  const [foldersData] = useState<Folder[]>(() =>
    JSON.parse(JSON.stringify(getCardsData()))
  );
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    setActiveFolder(currentFolder);
  }, [currentFolder]);

  useEffect(() => {
    if (shouldAnimate) {
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeFolder]);

  const currentFoldersData = findCurrentFoldersData(activeFolder, foldersData);
  const folderList = createFolderList(currentFoldersData);

  const handleFolderPress = (name: string) => {
    triggerHaptic();
    setDirection('forward');
    setShouldAnimate(true);
    setCurrentFolder(prev => [...prev, name]);
  };

  const handleUndoPress = () => {
    triggerHaptic();
    if (currentFolder.length === 0) {
      router.back();
      return;
    }
    setDirection('backward');
    setShouldAnimate(true);
    setCurrentFolder(prev => prev.slice(0, -1));
  };

  const handleConfirm = () => {
    triggerHaptic();
    router.push(`/test?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}`);
  };

  const FolderItem = ({ name }: { name: string }) => {
    return (
      <Pressable
        onPress={() => handleFolderPress(name)}
        style={({hovered, pressed}: any) => [
          styles.folderContainer,
          hovered && styles.folderHover,
          pressed && styles.folderPressed,
        ]}
      >
        <Text style={styles.folderTitleTextStyle}>{name}</Text>
        <Text style={styles.folderArrow}>{'＞'}</Text>
      </Pressable>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      height: 60,
      backgroundColor: colors.element,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      ...shadow,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginLeft: 15,
    },
    folderList: {
      padding: 20,
    },
    folderContainer: {
      width: "100%",
      borderRadius: 5,
      height: 60,
      backgroundColor: colors.element,
      borderLeftWidth: 6,
      borderLeftColor: colors.accentColor,
      justifyContent: 'center',
      paddingHorizontal: 15,
      marginBottom: 10,
      ...shadow,
    },
    folderHover: {
      backgroundColor: colors.elementHover,
    },
    folderPressed: {
      backgroundColor: colors.elementClicked,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 20,
      color: colors.titleText,
    },
    folderArrow: {
      position: "absolute",
      right: 15,
      color: colors.plainText,
      fontSize: 18,
    },
    confirmButton: {
      position: 'absolute',
      bottom: 30,
      alignSelf: 'center',
      backgroundColor: colors.accentColor,
      paddingVertical: 15,
      paddingHorizontal: 40,
      borderRadius: 30,
      ...shadow,
    },
    confirmButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: boldWeight,
    },
    breadcrumb: {
        padding: 10,
        backgroundColor: colors.element,
        marginBottom: 5,
    },
    breadcrumbText: {
        color: colors.plainText,
        fontSize: 14,
    }
  });

  return (
    <>
    <TabBar/>
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleUndoPress}>
          <Text style={{fontSize: 24, color: colors.titleText}}>{'＜'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('selectFolderHeader')}</Text>
      </View>

      <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbText}>
              {t('root')} {activeFolder.map(f => ` > ${f}`).join('')}
          </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Animated.View
          key={activeFolder.join('/')}
          entering={shouldAnimate ? (direction === 'forward' ? SlideInRight : SlideInLeft).duration(300).easing(Easing.bezier(0.25, 1, 0.5, 1)) : undefined}
          exiting={shouldAnimate ? (direction === 'forward' ? SlideOutLeft : SlideOutRight).duration(300).easing(Easing.bezier(0.25, 1, 0.5, 1)) : undefined}
          style={[
            { flex: 1 },
            Platform.OS === 'web' && (shouldAnimate ? {
              animationTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
            } : {
              animation: 'none',
              animationName: 'none',
            } as any)
          ]}
        >
          <FlatList
            data={folderList}
            renderItem={({ item }) => <FolderItem name={item} />}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.folderList}
          />
        </Animated.View>
      </View>

      <Pressable
        style={styles.confirmButton}
        onPress={() => {
          triggerHaptic();
          handleConfirm();
        }}
      >
        <Text style={styles.confirmButtonText}>{t('startTestWithFolder')}</Text>
      </Pressable>
    </View>
    </>
  );
}
