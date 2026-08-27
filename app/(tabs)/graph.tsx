import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { matchFont } from "@shopify/react-native-skia";
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line } from "victory-native";
import {
  Card,
  Folder,
  getCardsData,
  loadCardsData,
} from '../lib/cardsStore';
import { boldWeight, shadow, TabBar, useColors } from '../lib/colors';
import { useLanguage } from '../lib/languageContext';

const appIcon = require('../../assets/images/icon.png');


const toSafeNumber = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

let maxDays = 14;
let baseTimestamp = new Date(NaN).getTime();

// パラメータを引数として受け取るように変更
const getCardRetentionAtX = (
  x: number,
  objRememberTime: number,
  objStability: number,
  C1: number,
  C2: number
): number => {
  if (x <= 0) return 1.0;
  if (x > objRememberTime) return 0;

  // Kの計算（0除算防護策付き）
  const K_raw = Math.exp(-(C1 + objRememberTime * (C2 - 1)) / objStability);
  const K = Math.max(K_raw, Number.MIN_VALUE);

  let T = 0; // 累積時間
  let i = 1;

  while (i <= 100) {
    const delta = C1 * Math.pow(C2, i - 1); // Δt_i
    
    // x が現在の復習区間 [T, T + delta] 内にあるか判定
    if (x >= T && x <= T + delta) {
      const t = x - T; // 区間内の経過時間
      if (t === 0) return 1.0;
      // console.log(`C1: ${C1} C2: ${C2} K ${K}`)
      const S = -delta / Math.log(K);
      return Math.exp(-t / S);
    }

    T += delta;
    if (T > objRememberTime) break;
    i++;
  }
  return 1.0;
};

export default function FunctionChart() {
  const colors = useColors();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(0);

  const chartFont = useMemo(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: "Helvetica", android: "sans-serif", default: "sans-serif" }),
        fontSize: 12,
        fontStyle: "normal",
        fontWeight: "normal",
      });
    } catch (e) {
      console.warn("Skia matchFont is not available:", e);
      return undefined;
    }
  }, []);

  // フォルダデータを管理するステート
  const [foldersData, setFoldersData] = useState<Folder[]>(() =>
    JSON.parse(JSON.stringify(getCardsData()))
  );

  // 画面フォーカス時に最新のカードデータを読み込む
  useFocusEffect(
    useCallback(() => {
      loadCardsData().then(() => {
        setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      });
    }, [])
  );

  const validFolders = useMemo(() => {
    // 1. フォルダツリーを再帰的に探索し、親フォルダと子フォルダを独立したフラットな配列にする
    const flattenFolders = (folders: Folder[], path: string = ""): { folderName: string, cards: Card[] }[] => {
      let result: { folderName: string, cards: Card[] }[] = [];
      
      for (const folder of folders) {
        // パス名を作成（例: "英単語English/偽犬1900(青)/犬1900, 100~200"）
        const currentPathName = path ? `${path}/${folder.name}` : folder.name;
        
        // フォルダ直下のカードのみを格納（子フォルダのカードは混ぜない）
        result.push({
          folderName: currentPathName,
          cards: folder.cards
        });
        
        // 子フォルダがあれば再帰的に処理して追加
        if (folder.folders && folder.folders.length > 0) {
          result = result.concat(flattenFolders(folder.folders, currentPathName));
        }
      }
      return result;
    };

    const allFoldersFlat = flattenFolders(foldersData);

    // 2. カードが存在するフォルダのみを抽出（カードごとの目標値はグラフ生成時に使用）
    return allFoldersFlat.filter(folder => {
      if (folder.cards.length === 0) return false; // 空フォルダは除外
      return true;
    });
  }, [foldersData]);

  const targetFolder = validFolders[selectedFolderIndex] ?? validFolders[0];

  // ---- グラフ描画データの生成ロジック ----
  const chartData = useMemo(() => {
    const targetCards = targetFolder ? targetFolder.cards : [];

    if (targetCards.length === 0) return [];

    // 全カードの中で最大の目標日数（デフォルト14日）を取得
    const maxObjTime = Math.max(
      ...targetCards.map(c => toSafeNumber(c.objRememberTime, 14))
    );
    maxDays = Math.ceil(maxObjTime);
    baseTimestamp = Math.min(
      ...targetCards.map(c => new Date(c.createdAt).getTime())
    );

    const averagedChartData = [];
    const step = 0.1; // 0.1日単位で計算

    // x = 0 から maxDays まで共通の時間軸でループ
    for (let x = 0; x <= maxDays; x = parseFloat((x + step).toFixed(2))) {
      let totalY = 0;

      targetCards.forEach(card => {
        const objRememberTime = Math.max(1, toSafeNumber(card.objRememberTime, 14));
        const objStability = Math.max(1, toSafeNumber(card.objStability, 133));
        const C1 = toSafeNumber(card.C1, 1);
        const C2 = toSafeNumber(card.C2, 1.5);

        totalY += getCardRetentionAtX(x, objRememberTime, objStability, C1, C2);
      });

      // 常に「全カード数（targetCards.length）」で割るため、途中で破綻しない
      const avgY = totalY / targetCards.length;
      // console.log(`maisuu: ${targetCards.length}`)
      console.log(`X: ${x} Y: ${avgY.toFixed(4)}`)
      averagedChartData.push({
        x: x,
        y: parseFloat(avgY.toFixed(4)),
      });
    }

    return averagedChartData;
  }, [targetFolder]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headingContainer: {
      marginBottom: 0,
      margin: 20,
      padding: 5,
      backgroundColor: colors.element,
      borderRadius: 10,
      ...shadow,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      alignContent: 'center',
      textAlign: 'center',
      color: colors.plainText,
    },
    folderSelectorButton: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    folderSelectorButtonText: {
      fontSize: 14,
      color: colors.plainText,
      textAlign: 'center',
      fontWeight: boldWeight,
    },
    folderSectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.plainText,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 10,
    },
    foldersContentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    folderContainer: {
      width: "100%",
      alignSelf: "stretch",
      borderRadius: 5,
      paddingBottom: 10,
      backgroundColor: colors.element,
      borderTopWidth: 6,
      ...shadow,
    },
    folderHover: {
      backgroundColor: colors.elementHover,
    },
    folderPressed: {
      backgroundColor: colors.elementClicked,
    },
    folderTitleContainer: {
      flexDirection: "row",
      alignItems: "center",
      padding: 5,
      paddingLeft: 10,
      paddingRight: 30,
    },
    folderSubTitleContainer: {
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingLeft: 46,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
      flex: 1,
    },
    folderSubTitleTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
    checkbox: {
      marginRight: 12,
      width: 24,
      height: 24,
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
  });
console.log(`maxDays${maxDays}`)
const DAY_WIDTH = 50; // 1日（1マス）あたりのピクセル幅
const chartWidth = Math.max(350, maxDays * DAY_WIDTH); // 画面幅より小さくならないようにMath.maxを入れる
  return (
    <>
    <TabBar />
    <View style={{height: 48, backgroundColor: colors.element, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 50, ...shadow, zIndex: 10}}>
      <View style={{position: "absolute", left: 15}}>
        <Image source={appIcon} style={{width: 30, height: 30, borderRadius: 5}} />
      </View>
      <Text style={{ fontSize: 15, color: colors.plainText }}>
        {t('graphTab')}
      </Text>
      <Pressable 
        onPress={() => router.push('/settings')}
        style={{position: "absolute", right: 10}}
      >
        <View style={{width: 30, height: 30}}>
          <Ionicons name="menu" size={30} color={colors.plainText} />
        </View>
      </Pressable>
    </View>
    
    <ScrollView style={styles.container}>
      {/* グラフコンテナ */}
      <View style={styles.headingContainer}>
        <Text style={styles.title}>
          {t('memoryRetentionLevels')}
        </Text>
        <Pressable style={styles.folderSelectorButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.folderSelectorButtonText} numberOfLines={1}>
            {targetFolder ? targetFolder.folderName : 'フォルダを選択'}
          </Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ width: chartWidth, height: 200 }}>
            <CartesianChart 
              data={chartData} 
              xKey="x" 
              yKeys={["y"]}
              axisOptions={{
                formatXLabel: (value) => {
                  if (typeof value !== 'number' || isNaN(value)) {console.log(`e`); return '';}
                  // 経過日数 (value) をミリ秒に換算して基準日に足す
                  const targetMs = baseTimestamp + value * 24 * 60 * 60 * 1000;
                  const date = new Date(targetMs);
                  console.log(`date: ${baseTimestamp}`)
                  if (isNaN(date.getTime()))  {console.log(`f`); return '';};
                  // console.log(`targetMS: ${targetMs}`)
                  const mm = date.getMonth() + 1;
                  const dd = date.getDate();
                  //今日の日付かどうかを判定
                  const today = new Date();
                  const isToday = 
                    today.getFullYear() === date.getFullYear() &&
                    today.getMonth() === date.getMonth() &&
                    today.getDate() === date.getDate();

                  if (isToday) {
                    return `${mm}/${dd}\nToday`;
                  }
                  return `${mm}/${dd}`;
                },
                formatYLabel: (value) => `${value*100}%`,
                tickCount: { x: maxDays, y: 4 },
                ...(chartFont ? { font: chartFont } : {}),
                lineColor: "#ccc",
                labelColor: colors.plainText,
              }}
              domain={{ y: [0, 1.1] }}
            >
              {({ points }) => (
                <Line
                  points={points.y}
                  color="rgb(108, 192, 75)"
                  strokeWidth={3}
                />
              )}
            </CartesianChart>
          </View>
        </ScrollView>
      </View>
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setModalVisible(false)}
          >
            <View style={styles.modalContent}>
              {validFolders.map((item, index) => (
                <Pressable
                  key={item.folderName}
                  style={[
                    styles.modalItem,
                    index === validFolders.length - 1 && styles.lastModalItem,
                    index === selectedFolderIndex && { backgroundColor: colors.background + '80' }
                  ]}
                  onPress={() => {
                    setSelectedFolderIndex(index);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    index === selectedFolderIndex && { fontWeight: 'bold', color: colors.accentColor }
                  ]}>
                    {item.folderName}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
    </ScrollView>
    </>
  );
}
