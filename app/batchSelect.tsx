import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  batchDeleteCards,
  batchMoveCards,
  batchReplaceCardText,
  Card,
  findCurrentCardsData,
  Folder,
  getAllFolderPaths,
  getCardsData,
  isRTL,
} from './lib/cardsStore';
import { boldWeight, shadow, useColors } from './lib/colors';
import { useLanguage } from './lib/languageContext';
import { triggerHaptic } from './lib/haptic';
import { resolveImageUri } from './lib/cardImageHelper';

const CardImage = ({
  uri,
  fitMode,
  colors,
}: {
  uri: string;
  fitMode?: 'contain' | 'fullWidth';
  colors: any;
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const resolvedUri = resolveImageUri(uri);

  useEffect(() => {
    if (resolvedUri) {
      Image.getSize(
        resolvedUri,
        (w, h) => {
          if (w > 0 && h > 0) {
            setAspectRatio(w / h);
          }
        },
        () => {}
      );
    }
  }, [resolvedUri]);

  if (!resolvedUri) return null;

  if (fitMode === 'fullWidth') {
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={{
          width: '100%',
          aspectRatio: aspectRatio || 16 / 9,
          borderRadius: 8,
          marginVertical: 6,
          resizeMode: 'contain',
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.background,
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={{
        maxHeight: 300,
        width: '100%',
        height: 180,
        borderRadius: 8,
        marginVertical: 6,
        resizeMode: 'contain',
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.background,
      }}
    />
  );
};

// HSVからRGBに変換するヘルパー (cards.tsxと共通)
const hsvToRgb = (h: number, s: number, v: number) => {
  let r = 0,
    g = 0,
    b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

// 暗記度に応じた色を取得 (0=赤, 10000=緑) - cards.tsxと共通
const getBorderColor = (level: number) => {
  const normalizedLevel = Math.max(0, Math.min(10000, level));
  const ratio = normalizedLevel / 10000;
  const h = ratio * (120 / 360);
  const s = 0.9;
  const v = 0.9;
  const { r, g, b } = hsvToRgb(h, s, v);
  return `rgb(${r}, ${g}, ${b})`;
};

export default function BatchSelectScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ folderPath?: string }>();

  // フォルダパスの取得
  const folderPath: string[] = useMemo(() => {
    if (!params.folderPath) return [];
    try {
      return JSON.parse(params.folderPath);
    } catch {
      return [];
    }
  }, [params.folderPath]);

  const [foldersData, setFoldersData] = useState<Folder[]>(() =>
    JSON.parse(JSON.stringify(getCardsData()))
  );
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());

  // 移動モーダル関連
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string[] | null>(null);

  // 置換モーダル関連
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [searchStr, setSearchStr] = useState('');
  const [replaceStr, setReplaceStr] = useState('');
  const [replaceFront, setReplaceFront] = useState(true);
  const [replaceBack, setReplaceBack] = useState(true);
  const [replaceMemo, setReplaceMemo] = useState(false);

  // 現在のカード一覧
  const currentCards: Card[] = useMemo(() => {
    return findCurrentCardsData(folderPath, foldersData);
  }, [folderPath, foldersData]);

  // 全フォルダリスト（移動先候補）
  const allFolderPaths = useMemo(() => {
    return getAllFolderPaths(foldersData);
  }, [foldersData]);

  // 全選択・全解除
  const handleSelectAll = useCallback(() => {
    triggerHaptic();
    const all = new Set(currentCards.map((c) => c.uuid));
    setSelectedUuids(all);
  }, [currentCards]);

  const handleDeselectAll = useCallback(() => {
    triggerHaptic();
    setSelectedUuids(new Set());
  }, []);

  // カード選択トグル
  const handleToggleCard = useCallback((uuid: string) => {
    triggerHaptic();
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  // --- 一括削除 ---
  const handleBatchDelete = () => {
    if (selectedUuids.size === 0) {
      const msg = t('batchNoCardsSelected');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }

    triggerHaptic();
    const confirmMsg = t('batchDeleteConfirm', { count: selectedUuids.size });

    const performDelete = () => {
      const uuidsToDelete = Array.from(selectedUuids);
      const res = batchDeleteCards(folderPath, uuidsToDelete);
      if (res.success) {
        setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
        setSelectedUuids(new Set());
        const successMsg = t('batchDeleteSuccess', { count: res.deletedCount });
        if (Platform.OS === 'web') {
          window.alert(successMsg);
        } else {
          Alert.alert(t('batchDelete'), successMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        performDelete();
      }
    } else {
      Alert.alert(t('batchDelete'), confirmMsg, [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  // --- 一括移動 ---
  const openMoveModal = () => {
    if (selectedUuids.size === 0) {
      const msg = t('batchNoCardsSelected');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }
    triggerHaptic();
    setTargetMoveFolder(null);
    setIsMoveModalOpen(true);
  };

  const handleExecuteMove = () => {
    if (!targetMoveFolder) {
      const msg = t('batchMoveTitle');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }

    triggerHaptic();
    const isSame =
      folderPath.length === targetMoveFolder.length &&
      folderPath.every((val, index) => val === targetMoveFolder[index]);

    if (isSame) {
      const msg = t('batchMoveSameFolderError');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }

    const uuidsToMove = Array.from(selectedUuids);
    const res = batchMoveCards(folderPath, targetMoveFolder, uuidsToMove);

    if (res.success) {
      setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      setSelectedUuids(new Set());
      setIsMoveModalOpen(false);
      const folderDisplayName = targetMoveFolder.join(' / ');
      const successMsg = t('batchMoveSuccess', {
        count: res.movedCount,
        folder: folderDisplayName,
      });
      if (Platform.OS === 'web') {
        window.alert(successMsg);
      } else {
        Alert.alert(t('batchMove'), successMsg);
      }
    } else {
      const errMsg =
        res.errorReason === 'sameFolder'
          ? t('batchMoveSameFolderError')
          : '移動に失敗しました。';
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert(t('errorTitle'), errMsg);
      }
    }
  };

  // --- 一括編集 (文字列置換) ---
  const openReplaceModal = () => {
    if (selectedUuids.size === 0) {
      const msg = t('batchNoCardsSelected');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }
    triggerHaptic();
    setSearchStr('');
    setReplaceStr('');
    setReplaceFront(true);
    setReplaceBack(true);
    setReplaceMemo(false);
    setIsReplaceModalOpen(true);
  };

  const handleExecuteReplace = () => {
    if (!searchStr) {
      const msg = t('batchSearchEmptyError');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }

    const targetFields: ('front' | 'back' | 'memo')[] = [];
    if (replaceFront) targetFields.push('front');
    if (replaceBack) targetFields.push('back');
    if (replaceMemo) targetFields.push('memo');

    if (targetFields.length === 0) {
      const msg = t('batchNoFieldSelectedError');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('errorTitle'), msg);
      }
      return;
    }

    triggerHaptic();
    const uuidsToReplace = Array.from(selectedUuids);
    const res = batchReplaceCardText(folderPath, uuidsToReplace, {
      searchStr,
      replaceStr,
      targetFields,
    });

    if (res.success) {
      setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      setIsReplaceModalOpen(false);
      const successMsg = t('batchReplaceSuccess', { count: res.updatedCount });
      if (Platform.OS === 'web') {
        window.alert(successMsg);
      } else {
        Alert.alert(t('batchReplaceTitle'), successMsg);
      }
    }
  };

  const isAllSelected =
    currentCards.length > 0 && selectedUuids.size === currentCards.length;

  const currentFolderDisplayName =
    folderPath.length === 0 ? t('cards') : folderPath[folderPath.length - 1];

  // カード一覧画面 (cards.tsx) と同一のスタイル定義
  const cardStyles = StyleSheet.create({
    cardContainer: {
      ...shadow,
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: 5,
      minHeight: 50,
      backgroundColor: colors.element,
      borderLeftWidth: 6,
      borderLeftColor: colors.accentColor,
      zIndex: 2,
    },
    cardMemoContainer: {
      ...shadow,
      width: '90%',
      alignSelf: 'center',
      borderBottomLeftRadius: 5,
      borderBottomRightRadius: 5,
      padding: 5,
      backgroundColor: colors.memo,
      zIndex: 1,
    },
    cardHover: {
      backgroundColor: colors.elementHover,
    },
    cardPressed: {
      backgroundColor: colors.elementClicked,
    },
    cardTitleContainer: {
      marginTop: 0,
      minHeight: 35,
      justifyContent: 'center',
      paddingLeft: 10,
      paddingRight: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardSubTitleContainer: {
      justifyContent: 'center',
      paddingHorizontal: 10,
      marginBottom: 5,
      marginRight: 20,
    },
    cardTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
      flex: 1,
    },
    cardSubTitleTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
    cardMemoTextStyle: {
      fontSize: 14,
      color: colors.titleText,
    },
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      height: 56,
      backgroundColor: colors.element,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      ...shadow,
      zIndex: 10,
    },
    backButton: {
      padding: 6,
      marginRight: 8,
      borderRadius: 20,
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.plainText,
      marginTop: 1,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.element,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    selectedBadge: {
      backgroundColor: colors.lessAccentColor,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    selectedBadgeText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: boldWeight,
    },
    selectButtonsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    toolbarButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background,
    },
    toolbarButtonText: {
      fontSize: 13,
      color: colors.titleText,
      fontWeight: boldWeight,
    },
    listContent: {
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 110,
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: colors.plainText,
      textAlign: 'center',
    },
    // 下部アクションバー
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 76,
      backgroundColor: colors.element,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 10,
      ...shadow,
    },
    actionButton: {
      flex: 1,
      marginHorizontal: 4,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    },
    actionDelete: {
      backgroundColor: '#E53935',
    },
    actionMove: {
      backgroundColor: colors.accentColor,
    },
    actionReplace: {
      backgroundColor: colors.lessAccentColor,
    },
    actionDisabled: {
      opacity: 0.4,
    },
    actionButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: boldWeight,
      marginTop: 4,
      textAlign: 'center',
    },
    // モーダル共通スタイル
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.element,
      borderRadius: 14,
      padding: 20,
      maxHeight: '80%',
      ...shadow,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 16,
      textAlign: 'center',
    },
    modalLabel: {
      fontSize: 13,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 6,
      marginTop: 10,
    },
    modalInput: {
      backgroundColor: colors.background,
      color: colors.titleText,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      marginBottom: 8,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    checkboxLabel: {
      fontSize: 14,
      color: colors.titleText,
      marginLeft: 8,
    },
    modalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 20,
    },
    modalButton: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    cancelButtonText: {
      color: colors.plainText,
      fontSize: 14,
      fontWeight: boldWeight,
    },
    confirmButton: {
      backgroundColor: colors.accentColor,
    },
    confirmButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: boldWeight,
    },
    // フォルダ一覧（移動モーダル）
    folderSelectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      borderRadius: 6,
    },
    folderSelectItemActive: {
      backgroundColor: colors.elementHover,
    },
    folderSelectText: {
      fontSize: 15,
      color: colors.titleText,
      marginLeft: 10,
      flex: 1,
    },
  });

  const hasSelection = selectedUuids.size > 0;

  return (
    <View style={styles.container}>
      {/* 画面ヘッダー */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            triggerHaptic();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.titleText} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('batchActionTitle')}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {currentFolderDisplayName}
          </Text>
        </View>
      </View>

      {/* 選択ツールバー */}
      <View style={styles.toolbar}>
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedBadgeText}>
            {t('batchSelectedCount', { count: selectedUuids.size })}
          </Text>
        </View>
        <View style={styles.selectButtonsRow}>
          {!isAllSelected ? (
            <Pressable style={styles.toolbarButton} onPress={handleSelectAll}>
              <Text style={styles.toolbarButtonText}>{t('batchSelectAll')}</Text>
            </Pressable>
          ) : null}
          {hasSelection ? (
            <Pressable style={styles.toolbarButton} onPress={handleDeselectAll}>
              <Text style={styles.toolbarButtonText}>{t('batchDeselectAll')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* カード一覧 (カード一覧画面のカードUIと同一) */}
      <FlatList
        data={currentCards}
        keyExtractor={(item) => item.uuid}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="documents-outline"
              size={48}
              color={colors.plainText}
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.emptyText}>{t('noCardsInFolder')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selectedUuids.has(item.uuid);
          const borderColor = getBorderColor(item.memorizationLevel);

          return (
            <View style={{ position: 'relative', marginBottom: 10 }}>
              <Pressable
                onPress={() => handleToggleCard(item.uuid)}
                style={({ hovered, pressed }) => [
                  cardStyles.cardContainer,
                  {
                    flexDirection: 'row',
                    borderLeftColor: borderColor,
                    backgroundColor: isSelected ? colors.elementClicked : colors.element,
                  },
                  !isSelected && hovered && cardStyles.cardHover,
                  pressed && cardStyles.cardPressed,
                ]}
              >
                {/* チェックボックス */}
                <View
                  style={{
                    paddingLeft: 12,
                    paddingRight: 4,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={isSelected ? colors.accentColor : colors.plainText}
                  />
                </View>

                {/* カード表面・裏面・画像エリア */}
                {!(item.frontImage || item.backImage) ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View
                        style={[
                          cardStyles.cardTitleContainer,
                          { paddingLeft: 10, paddingRight: 20 },
                        ]}
                      >
                        <Text
                          style={[
                            cardStyles.cardTitleTextStyle,
                            isRTL(item.front) && { textAlign: 'right' },
                          ]}
                        >
                          {item.front}
                        </Text>
                      </View>
                      <View
                        style={[
                          cardStyles.cardSubTitleContainer,
                          { paddingLeft: 10, paddingRight: 20 },
                        ]}
                      >
                        <Text style={cardStyles.cardSubTitleTextStyle}>{item.back}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      paddingRight: 20,
                      paddingLeft: 10,
                      paddingVertical: 4,
                      justifyContent: 'center',
                    }}
                  >
                    {/* 1. frontText */}
                    <View
                      style={[
                        cardStyles.cardTitleContainer,
                        { paddingLeft: 0, paddingRight: 0 },
                      ]}
                    >
                      <Text
                        style={[
                          cardStyles.cardTitleTextStyle,
                          isRTL(item.front) && { textAlign: 'right' },
                        ]}
                      >
                        {item.front}
                      </Text>
                    </View>

                    {/* 2. frontImage */}
                    {!!item.frontImage && (
                      <CardImage
                        uri={item.frontImage}
                        fitMode={item.frontImageFitMode}
                        colors={colors}
                      />
                    )}

                    {/* 3. backText */}
                    <View
                      style={[
                        cardStyles.cardSubTitleContainer,
                        {
                          paddingLeft: 0,
                          paddingRight: 0,
                          marginTop: item.frontImage ? 4 : 0,
                        },
                      ]}
                    >
                      <Text style={cardStyles.cardSubTitleTextStyle}>{item.back}</Text>
                    </View>

                    {/* 4. backImage */}
                    {!!item.backImage && (
                      <CardImage
                        uri={item.backImage}
                        fitMode={item.backImageFitMode}
                        colors={colors}
                      />
                    )}
                  </View>
                )}
              </Pressable>

              {/* メモコンテナ (cards.tsxと同一デザイン) */}
              {item.memo !== '' && (
                <View style={cardStyles.cardMemoContainer}>
                  <Text style={cardStyles.cardMemoTextStyle}>{item.memo}</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* 下部アクションバー */}
      <View style={styles.bottomBar}>
        {/* 一括削除 */}
        <Pressable
          style={[
            styles.actionButton,
            styles.actionDelete,
            !hasSelection && styles.actionDisabled,
          ]}
          onPress={handleBatchDelete}
          disabled={!hasSelection}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonText} numberOfLines={1}>
            {t('batchDelete')}
          </Text>
        </Pressable>

        {/* 一括移動 */}
        <Pressable
          style={[
            styles.actionButton,
            styles.actionMove,
            !hasSelection && styles.actionDisabled,
          ]}
          onPress={openMoveModal}
          disabled={!hasSelection}
        >
          <Ionicons name="folder-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonText} numberOfLines={1}>
            {t('batchMove')}
          </Text>
        </Pressable>

        {/* 一括編集 (文字列置換) */}
        <Pressable
          style={[
            styles.actionButton,
            styles.actionReplace,
            !hasSelection && styles.actionDisabled,
          ]}
          onPress={openReplaceModal}
          disabled={!hasSelection}
        >
          <Ionicons name="repeat-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonText} numberOfLines={1}>
            {t('batchEditReplace')}
          </Text>
        </Pressable>
      </View>

      {/* 移動先フォルダ選択モーダル */}
      <Modal
        visible={isMoveModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMoveModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsMoveModalOpen(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('batchMoveTitle')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {allFolderPaths.map((item) => {
                const isCurrent =
                  folderPath.length === item.path.length &&
                  folderPath.every((val, index) => val === item.path[index]);
                const isSelectedTarget =
                  targetMoveFolder !== null &&
                  targetMoveFolder.length === item.path.length &&
                  targetMoveFolder.every((val, index) => val === item.path[index]);

                return (
                  <Pressable
                    key={item.displayName}
                    style={[
                      styles.folderSelectItem,
                      isSelectedTarget && styles.folderSelectItemActive,
                      isCurrent && { opacity: 0.5 },
                    ]}
                    onPress={() => {
                      if (!isCurrent) {
                        triggerHaptic();
                        setTargetMoveFolder(item.path);
                      }
                    }}
                  >
                    <Ionicons
                      name="folder"
                      size={20}
                      color={isSelectedTarget ? colors.accentColor : colors.plainText}
                    />
                    <Text style={styles.folderSelectText}>
                      {item.displayName}{' '}
                      {isCurrent ? `(${t('currentFolderLabel') || '現在'})` : ''}
                    </Text>
                    {isSelectedTarget && (
                      <Ionicons name="checkmark" size={20} color={colors.accentColor} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsMoveModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  !targetMoveFolder && styles.actionDisabled,
                ]}
                onPress={handleExecuteMove}
                disabled={!targetMoveFolder}
              >
                <Text style={styles.confirmButtonText}>
                  {t('batchMoveToThisFolder')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 文字列置換モーダル */}
      <Modal
        visible={isReplaceModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsReplaceModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsReplaceModalOpen(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('batchReplaceTitle')}</Text>

            <Text style={styles.modalLabel}>{t('batchReplaceSearchLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={searchStr}
              onChangeText={setSearchStr}
              placeholder={t('batchReplaceSearchPlaceholder')}
              placeholderTextColor={colors.plainText}
            />

            <Text style={styles.modalLabel}>{t('batchReplaceTargetLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={replaceStr}
              onChangeText={setReplaceStr}
              placeholder={t('batchReplaceTargetPlaceholder')}
              placeholderTextColor={colors.plainText}
            />

            <Text style={styles.modalLabel}>{t('batchReplaceFieldsLabel')}</Text>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setReplaceFront(!replaceFront)}
            >
              <Ionicons
                name={replaceFront ? 'checkbox' : 'square-outline'}
                size={20}
                color={replaceFront ? colors.accentColor : colors.plainText}
              />
              <Text style={styles.checkboxLabel}>{t('batchReplaceFront')}</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setReplaceBack(!replaceBack)}
            >
              <Ionicons
                name={replaceBack ? 'checkbox' : 'square-outline'}
                size={20}
                color={replaceBack ? colors.accentColor : colors.plainText}
              />
              <Text style={styles.checkboxLabel}>{t('batchReplaceBack')}</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setReplaceMemo(!replaceMemo)}
            >
              <Ionicons
                name={replaceMemo ? 'checkbox' : 'square-outline'}
                size={20}
                color={replaceMemo ? colors.accentColor : colors.plainText}
              />
              <Text style={styles.checkboxLabel}>{t('batchReplaceMemo')}</Text>
            </Pressable>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsReplaceModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleExecuteReplace}
              >
                <Text style={styles.confirmButtonText}>{t('batchReplaceExecute')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
