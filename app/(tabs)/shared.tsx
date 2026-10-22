import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Modal,
  Linking,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useColors, boldWeight, shadow, TabBar } from '../lib/colors';
import { useLanguage } from '../lib/languageContext';
import { triggerHaptic } from '../lib/haptic';
import { getDeviceUuid } from '../lib/deviceUuid';
import { getMySharedFolderIds, removeMySharedFolderId } from '../lib/sharedFolderHelper';
import { importSharedFolder, SharedFolder, SharedCard, isRTL } from '../lib/cardsStore';
import { recordFolderImport } from '../lib/achievementsStore';
import { copyToClipboard } from '../lib/clipboard';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoSpeech from 'expo-speech';
import { franc } from 'franc';

const appIcon = require('../../assets/images/icon.png');

type SharedFolderDoc = {
  id: string;
  shareID: string;
  publisher: string;
  createdAt: string;
  folder: SharedFolder;
};

// 再帰的にフォルダ内のカードおよびサブフォルダをプレビュー表示するコンポーネント
const FolderPreviewContent = ({
  folder,
  colors,
  depth = 0,
}: {
  folder: SharedFolder;
  colors: any;
  depth?: number;
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeech = (text: string) => {
    triggerHaptic();
    if (isSpeaking) {
      ExpoSpeech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);

    const detectedLang = franc(text);
    let language = 'en';
    if (detectedLang !== 'und') {
      language = detectedLang.slice(0, 2);
    }

    const options = {
      language: language,
      pitch: 1.0,
      rate: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    };

    ExpoSpeech.speak(text, options);
  };

  return (
    <View style={{ marginLeft: depth * 12, marginBottom: 12 }}>
      {depth > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
          <Ionicons name="folder-open-outline" size={18} color={colors.accentColor} />
          <Text style={{ fontSize: 16, fontWeight: boldWeight, color: colors.titleText }}>
            {folder.name}
          </Text>
        </View>
      )}

      {/* カード一覧 */}
      {(folder.cards || []).map((card: SharedCard, idx: number) => (
        <React.Fragment key={idx}>
          <View style={{ position: 'relative' }}>
            <View
              style={[
                {
                  ...shadow,
                  width: '100%',
                  alignSelf: 'stretch',
                  borderRadius: 5,
                  minHeight: 50,
                  backgroundColor: colors.element,
                  borderLeftWidth: 6,
                  borderLeftColor: colors.accentColor,
                  flexDirection: 'row',
                },
              ]}
            >
              {/* 音声読み上げボタン */}
              <Pressable
                onPress={() => handleSpeech(card.front)}
                style={{
                  paddingLeft: 6,
                  paddingTop: 5,
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="volume-high" size={20} color="grey" />
              </Pressable>

              {/* 縦区切り線 */}
              <View style={{ width: 1, backgroundColor: colors.divider, margin: 5, alignSelf: 'stretch' }} />

              {/* カード本文 */}
              <View style={{ flex: 1, paddingRight: 10, paddingVertical: 4, justifyContent: 'center' }}>
                <View style={{ justifyContent: 'center', paddingLeft: 0, paddingRight: 0 }}>
                  <Text
                    style={[
                      {
                        fontWeight: boldWeight,
                        fontSize: 28,
                        color: colors.titleText,
                      },
                      isRTL(card.front) && { textAlign: 'right' },
                    ]}
                  >
                    {card.front}
                  </Text>
                </View>

                {card.back !== '' && (
                  <View style={{ justifyContent: 'center', paddingHorizontal: 0, marginTop: 2 }}>
                    <Text style={{ fontSize: 16, color: colors.plainText }}>{card.back}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* メモ */}
            {card.memo !== '' && (
              <View
                style={{
                  ...shadow,
                  width: '90%',
                  alignSelf: 'center',
                  borderBottomLeftRadius: 5,
                  borderBottomRightRadius: 5,
                  padding: 5,
                  backgroundColor: colors.memo,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.titleText }}>
                  {card.memo}
                </Text>
              </View>
            )}

            <View style={{ height: 10 }} />
          </View>
        </React.Fragment>
      ))}

      {/* サブフォルダ */}
      {(folder.folders || []).map((subFolder, sIdx) => (
        <FolderPreviewContent key={sIdx} folder={subFolder} colors={colors} depth={depth + 1} />
      ))}
    </View>
  );
};

export default function SharedFoldersScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharedList, setSharedList] = useState<SharedFolderDoc[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<SharedFolderDoc | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [mySharedIds, setMySharedIds] = useState<string[]>([]);

  // 端末情報と自分が共有したフォルダID一覧の読み込み
  const loadDeviceInfo = async () => {
    try {
      const [uuid, ids] = await Promise.all([
        getDeviceUuid(),
        getMySharedFolderIds(),
      ]);
      setDeviceUuid(uuid);
      setMySharedIds(ids);
    } catch (e) {
      console.error('Failed to load device info:', e);
    }
  };

  // 自分が共有したフォルダかどうかを判定
  const isMySharedFolder = (item: SharedFolderDoc): boolean => {
    if (deviceUuid && item.publisher && item.publisher === deviceUuid) {
      return true;
    }
    if (mySharedIds.includes(item.id) || mySharedIds.includes(item.shareID)) {
      return true;
    }
    return false;
  };

  // フォルダ内のカード総数を再帰的にカウント
  const countCardsInFolder = (sf: SharedFolder): number => {
    let count = (sf.cards || []).length;
    if (sf.folders) {
      for (const sub of sf.folders) {
        count += countCardsInFolder(sub);
      }
    }
    return count;
  };

  const fetchSharedFolders = async () => {
    setErrorMsg(null);
    try {
      const q = query(collection(db, 'sharedFolders'));
      const querySnapshot = await getDocs(q);
      const list: SharedFolderDoc[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const folderData: SharedFolder = (data.folder && typeof data.folder === 'object' && data.folder.name)
          ? (data.folder as SharedFolder)
          : {
              name: data.name || data.folderName || '無題のフォルダ',
              cards: Array.isArray(data.cards) ? data.cards : [],
              folders: Array.isArray(data.folders) ? data.folders : [],
            };

        let createdAtStr = '';
        if (typeof data.createdAt === 'string') {
          createdAtStr = data.createdAt;
        } else if (data.createdAt?.toDate && typeof data.createdAt.toDate === 'function') {
          createdAtStr = data.createdAt.toDate().toISOString();
        } else if (data.createdAt instanceof Date) {
          createdAtStr = data.createdAt.toISOString();
        }

        list.push({
          id: docSnap.id,
          shareID: data.shareID || docSnap.id,
          publisher: data.publisher || '',
          createdAt: createdAtStr,
          folder: folderData,
        });
      });

      // 作成日時の新しい順にソート
      list.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return b.id.localeCompare(a.id);
      });

      setSharedList(list);
    } catch (error: any) {
      console.error('Failed to fetch shared folders:', error);
      setErrorMsg(error?.message || '読み込みエラーが発生しました。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadDeviceInfo();
      fetchSharedFolders();
    }, [])
  );

  const onRefresh = () => {
    triggerHaptic();
    setRefreshing(true);
    void loadDeviceInfo();
    fetchSharedFolders();
  };

  const handleDeleteSharedFolder = (docItem: SharedFolderDoc) => {
    triggerHaptic();
    const folderName = docItem.folder.name || '無題のフォルダ';
    const confirmMessage = t('deleteSharedFolderConfirm').replace('{name}', folderName);

    const executeDelete = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'sharedFolders', docItem.id);
        await deleteDoc(docRef);

        await removeMySharedFolderId(docItem.id);
        await removeMySharedFolderId(docItem.shareID);

        setSharedList((prev) => prev.filter((item) => item.id !== docItem.id));
        setMySharedIds((prev) => prev.filter((id) => id !== docItem.id && id !== docItem.shareID));

        if (previewTarget?.id === docItem.id) {
          setPreviewTarget(null);
        }

        const successMsg = t('deleteSharedFolderSuccess');
        if (Platform.OS === 'web') {
          window.alert(successMsg);
        } else {
          Alert.alert(t('sharedFolders'), successMsg);
        }
      } catch (e) {
        console.error('Failed to delete shared folder:', e);
        const errMsg = t('deleteSharedFolderError');
        if (Platform.OS === 'web') {
          window.alert(errMsg);
        } else {
          Alert.alert(t('cards'), errMsg);
        }
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        void executeDelete();
      }
    } else {
      Alert.alert(
        t('deleteSharedFolder'),
        confirmMessage,
        [
          { text: t('close'), style: 'cancel' },
          { text: t('deleteSharedFolder'), style: 'destructive', onPress: () => void executeDelete() },
        ]
      );
    }
  };

  const handleImport = (docItem: SharedFolderDoc) => {
    triggerHaptic();
    const res = importSharedFolder(docItem.folder);
    if (res.success) {
      // 実績：フォルダ取り込み回数を記録
      void recordFolderImport();
      const msg = t('importFolderSuccess').replace('{name}', res.importedName);
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('cards'), msg);
      }
      setPreviewTarget(null);
    }
  };

  const handleCopyShareId = async (shareId: string) => {
    triggerHaptic();
    try {
      await copyToClipboard(shareId);
      if (Platform.OS === 'web') {
        window.alert(t('shareIdCopied'));
      } else {
        Alert.alert(t('cards'), t('shareIdCopied'));
      }
    } catch (e) {
      console.error('Failed to copy share ID:', e);
    }
  };

  const handleOpenReportModal = () => {
    triggerHaptic();
    setIsReportModalOpen(true);
  };

  const handleConfirmReport = () => {
    triggerHaptic();
    setIsReportModalOpen(false);
    const url = 'https://docs.google.com/forms/d/e/1FAIpQLSfsckn4LMjecZsscP82nkd0eZFmULgEuqWAL9b7LlMuNpYByg/viewform';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch((err) => console.error("Could not open URL:", err));
    }
  };

  // フォルダカード専用スタイル（cards.tsx と統一）
  const folderStyles = StyleSheet.create({
    folderContainer: {
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: 5,
      backgroundColor: colors.element,
      borderTopWidth: 6,
      borderTopColor: colors.accentColor,
      ...shadow,
    },
    folderHover: {
      backgroundColor: colors.elementHover,
    },
    folderPressed: {
      backgroundColor: colors.elementClicked,
    },
    folderTitleContainer: {
      justifyContent: 'center',
      padding: 5,
      paddingLeft: 10,
      paddingRight: 10,
    },
    folderSubTitleContainer: {
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
    },
    folderSubTitleTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 15,
      paddingBottom: 40,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    titleText: {
      fontSize: 24,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.element,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    refreshText: {
      fontSize: 14,
      color: colors.plainText,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      color: colors.plainText,
      marginTop: 12,
    },
    errorBox: {
      backgroundColor: '#FFE5E5',
      padding: 12,
      borderRadius: 8,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: '#FF4D4D',
    },
    errorText: {
      color: '#D8000C',
      fontSize: 13,
    },
    // モーダル用スタイル
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.element,
      borderRadius: 12,
      padding: 20,
      width: '100%',
      maxWidth: 500,
      maxHeight: '85%',
      ...shadow,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 4,
    },
  });

  return (
    <View style={styles.container}>
      <TabBar />

      <View style={{height: 48, backgroundColor: colors.element, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 50, ...shadow, zIndex: 10}}>
        <View style={{position: "absolute", left: 15}}>
          <Image source={appIcon} style={{width: 30, height: 30, borderRadius: 5}} />
        </View>
        <Text style={{ fontSize: 15, color: colors.plainText }}>
          {t('sharedFolders')}
        </Text>
        <Pressable 
          onPress={() => { triggerHaptic(); router.push('/settings'); }}
          style={{position: "absolute", right: 10}}
        >
          <View style={{width: 30, height: 30}}>
            <Ionicons name="menu" size={30} color={colors.plainText} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accentColor]} />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.titleText}>{t('sharedFolders')}</Text>
          <Pressable style={styles.refreshButton} onPress={onRefresh}>
            <Ionicons name="refresh" size={16} color={colors.plainText} />
            <Text style={styles.refreshText}>{t('refresh')}</Text>
          </Pressable>
        </View>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={colors.accentColor} />
          </View>
        ) : sharedList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={50} color={colors.plainText} />
            <Text style={styles.emptyText}>{t('emptySharedFolders')}</Text>
          </View>
        ) : (
          sharedList.map((item) => {
            const cardCount = countCardsInFolder(item.folder);
            const infoText = `${cardCount}${t('cardsCount')}`;
            const isMyFolder = isMySharedFolder(item);

            return (
              <React.Fragment key={item.id}>
                <View
                  style={[
                    folderStyles.folderContainer,
                    { flexDirection: 'row', alignItems: 'stretch' },
                  ]}
                >
                  {/* 自分が共有したことを示すマーク（左側） */}
                  {isMyFolder && (
                    <View
                      style={{
                        paddingLeft: 10,
                        paddingRight: 2,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: colors.accentColor + '20',
                          paddingHorizontal: 6,
                          paddingVertical: 4,
                          borderRadius: 6,
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <Ionicons name="person" size={16} color={colors.accentColor} />
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: boldWeight,
                            color: colors.accentColor,
                            textAlign: 'center',
                          }}
                        >
                          {t('mySharedBadge')}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* メインフォルダ情報 (タップで中身プレビュー表示) */}
                  <Pressable
                    style={({ hovered, pressed }) => [
                      { flex: 1, borderTopLeftRadius: isMyFolder ? 0 : 5, borderBottomLeftRadius: isMyFolder ? 0 : 5, paddingBottom: 10 },
                      hovered && folderStyles.folderHover,
                      pressed && folderStyles.folderPressed,
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setPreviewTarget(item);
                    }}
                  >
                    <View style={folderStyles.folderTitleContainer}>
                      <Text
                        style={folderStyles.folderTitleTextStyle}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.folder.name}
                      </Text>
                    </View>

                    <View style={folderStyles.folderSubTitleContainer}>
                      <Text style={folderStyles.folderSubTitleTextStyle}>{infoText}</Text>
                    </View>
                  </Pressable>

                  {/* 削除ボタン（自分が共有したフォルダのみ表示） */}
                  {isMyFolder && (
                    <>
                      <View style={{ width: 1, backgroundColor: colors.divider, marginVertical: 6 }} />
                      <Pressable
                        onPress={() => handleDeleteSharedFolder(item)}
                        style={({ hovered, pressed }) => [
                          {
                            width: 76,
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 4,
                          },
                          hovered && { backgroundColor: colors.dangerBackground },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        <Text style={{ color: colors.danger, fontWeight: boldWeight, fontSize: 12 }}>
                          {t('deleteSharedFolder')}
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {/* 縦区切り線 */}
                  <View style={{ width: 1, backgroundColor: colors.divider, marginVertical: 6 }} />

                  {/* 取り込みボタン */}
                  <Pressable
                    onPress={() => handleImport(item)}
                    style={({ hovered, pressed }) => [
                      {
                        width: isMyFolder ? 76 : 85,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderTopRightRadius: 5,
                        borderBottomRightRadius: 5,
                        gap: 4,
                      },
                      hovered && folderStyles.folderHover,
                      pressed && folderStyles.folderPressed,
                    ]}
                  >
                    <Ionicons name="download-outline" size={22} color={colors.accentColor} />
                    <Text style={{ color: colors.accentColor, fontWeight: boldWeight, fontSize: 13 }}>
                      {t('importFolder')}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ height: 10 }} />
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      {/* フォルダ中身確認モーダル */}
      <Modal
        visible={previewTarget !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (isReportModalOpen) {
            setIsReportModalOpen(false);
          } else {
            setPreviewTarget(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (isReportModalOpen) {
                setIsReportModalOpen(false);
              } else {
                setIsReportModalOpen(false);
                setPreviewTarget(null);
              }
            }}
          />
          <View style={styles.modalContent}>
            {previewTarget && (
              <>
                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Ionicons name="folder-open" size={24} color={colors.accentColor} />
                    <Text style={styles.modalTitle}>{previewTarget.folder.name}</Text>
                    {isMySharedFolder(previewTarget) && (
                      <View
                        style={{
                          backgroundColor: colors.accentColor + '20',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Ionicons name="person" size={12} color={colors.accentColor} />
                        <Text style={{ fontSize: 11, fontWeight: boldWeight, color: colors.accentColor }}>
                          {t('mySharedBadge')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12, color: colors.plainText, opacity: 0.8 }} selectable={true}>
                      ID: {previewTarget.shareID || previewTarget.id}
                    </Text>
                    <Pressable
                      onPress={() => handleCopyShareId(previewTarget.shareID || previewTarget.id)}
                      style={({ hovered, pressed }: any) => [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: colors.element,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: colors.divider,
                        },
                        hovered && { backgroundColor: colors.elementHover },
                        pressed && { backgroundColor: colors.elementClicked },
                      ]}
                    >
                      <Ionicons name="copy-outline" size={13} color={colors.accentColor} />
                      <Text style={{ fontSize: 11, color: colors.accentColor, fontWeight: boldWeight }}>
                        {t('copyShareId')}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={{ fontSize: 13, color: colors.plainText, marginBottom: 12 }}>
                  {t('folderContentPreview')} ({countCardsInFolder(previewTarget.folder)}{t('cardsCount')})
                </Text>

                <ScrollView
                  style={{ flexShrink: 1, maxHeight: 400, marginVertical: 8 }}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {countCardsInFolder(previewTarget.folder) === 0 ? (
                    <Text style={{ fontSize: 14, color: colors.plainText, textAlign: 'center', marginVertical: 20 }}>
                      {t('noCardsInFolder')}
                    </Text>
                  ) : (
                    <FolderPreviewContent folder={previewTarget.folder} colors={colors} />
                  )}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 15, alignItems: 'center' }}>
                  {isMySharedFolder(previewTarget) ? (
                    <Pressable
                      style={({ hovered, pressed }: any) => [
                        {
                          paddingHorizontal: 12,
                          height: 44,
                          backgroundColor: colors.dangerBackground,
                          borderColor: colors.dangerBorder,
                          borderWidth: 1,
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 4,
                        },
                        hovered && { opacity: 0.8 },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => previewTarget && handleDeleteSharedFolder(previewTarget)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      <Text style={{ color: colors.danger, fontWeight: boldWeight, fontSize: 13 }}>
                        {t('deleteSharedFolder')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ hovered, pressed }: any) => [
                        {
                          width: 44,
                          height: 44,
                          backgroundColor: colors.dangerBackground,
                          borderColor: colors.dangerBorder,
                          borderWidth: 1,
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                        hovered && { opacity: 0.8 },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={handleOpenReportModal}
                    >
                      <Ionicons name="flag-outline" size={18} color={colors.danger} />
                    </Pressable>
                  )}

                  <Pressable
                    style={{
                      flex: 1,
                      backgroundColor: colors.background,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.divider,
                    }}
                    onPress={() => {
                      setIsReportModalOpen(false);
                      setPreviewTarget(null);
                    }}
                  >
                    <Text style={{ color: colors.plainText, fontWeight: boldWeight, fontSize: 13 }}>{t('close')}</Text>
                  </Pressable>

                  <Pressable
                    style={{
                      flex: 1.2,
                      backgroundColor: colors.accentColor,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                    onPress={() => previewTarget && handleImport(previewTarget)}
                  >
                    <Ionicons name="download-outline" size={16} color="white" />
                    <Text style={{ color: 'white', fontWeight: boldWeight, fontSize: 13 }} numberOfLines={1}>
                      {t('importFolder')}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* 報告確認モーダル（スマホでの複数Modal重複表示エラーを回避するため内側オーバーレイとして表示） */}
            {isReportModalOpen && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: colors.element,
                    borderRadius: 12,
                    padding: 20,
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10,
                  },
                ]}
              >
                <View style={{ alignItems: 'center', marginBottom: 12, width: '100%' }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: colors.dangerBackground,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons name="flag" size={24} color={colors.danger} />
                  </View>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: boldWeight,
                      color: colors.titleText,
                      textAlign: 'center',
                      marginBottom: 10,
                    }}
                  >
                    {t('reportInappropriateFolder')}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.plainText, textAlign: 'center', lineHeight: 20 }}>
                    {t('reportFolderConfirm')}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15, width: '100%' }}>
                  <Pressable
                    style={{
                      flex: 1,
                      backgroundColor: colors.background,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.divider,
                    }}
                    onPress={() => setIsReportModalOpen(false)}
                  >
                    <Text style={{ color: colors.plainText, fontWeight: boldWeight, fontSize: 13 }}>{t('cancel')}</Text>
                  </Pressable>

                  <Pressable
                    style={{
                      flex: 1,
                      backgroundColor: colors.danger,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={handleConfirmReport}
                  >
                    <Text style={{ color: 'white', fontWeight: boldWeight, fontSize: 13 }}>OK</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
