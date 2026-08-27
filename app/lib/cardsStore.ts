import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetGoalsData } from './goalsStore';

export type TestResult = {
  timestamp: string;
  isCorrect: boolean;
  timeTaken: number; // 秒単位
  isStudied?: boolean;
};

export type CardImageFitMode = 'contain' | 'fullWidth';

export type Card = {
  uuid: string; // ユニーク識別子
  front: string;
  back: string;
  memo: string;
  createdAt: string;
  lastEdited: string;
  memorizationLevel: number;
  testHistory?: TestResult[];
  nextTestTime?: number;
  
  // --- 新たに追加した数理モデル用の属性 ---
  T0?: string; // 初回復習の起点タイムスタンプ
  initialReviewCompleted?: boolean; // T0日の初回復習を完了したか
  C1?: number; // 初期学習間隔（パラメータ1）
  C2?: number; // 学習間隔の増加率（パラメータ2）
  objRememberTime?: number; // 目標記憶日数 [日]
  objStability?: number; // 目標記憶安定性
  frontImage?: string;
  backImage?: string;
  frontImageFitMode?: CardImageFitMode;
  backImageFitMode?: CardImageFitMode;
  frontAscii?: boolean;
  backAscii?: boolean;
  memoAscii?: boolean;
};

export type Folder = {
  uuid?: string;
  name: string;
  folders: Folder[];
  cards: Card[];
};

// UUID生成用の簡易ヘルパー関数
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function addUuidsRecursively(folders: any[]): Folder[] {
  return folders.map(folder => ({
    ...folder,
    folders: folder.folders ? addUuidsRecursively(folder.folders) : [],
    cards: folder.cards ? folder.cards.map((card: any) => ({
      ...card,
      uuid: card.uuid || generateUUID()
    })) : []
  }));
}

const STORAGE_KEY = 'cards_data';

// 各フォルダ・階層ごとに objRememberTime と objStability の値を統一してダミーデータを構成
const initialCardsDataRaw: any[] = [
  { 
    name: "モニター用単語", 
    folders: [], 
    cards: [
      { front: "incongruous", back: "調和しない、矛盾した", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "rigorous", back: "厳格な、厳しい", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "aboveboard", back: "公明正大な、率直な", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "gluttonous", back: "大食漢の、欲張りな", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "nocturnal", back: "夜行性の、夜の", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "faltered", back: "つまずいた、よろめいた", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "at large", back: "逃亡中で、全体として", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "down the road", back: "将来、いつかは", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "at the outset", back: "最初は、初めに", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "palliatively", back: "緩和的に、一時しのぎに", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "quandary", back: "困惑、窮地", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "rejoinder", back: "返答、言い返し", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "ravage", back: "荒廃させる、破壊する", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "kiln", back: "窯、炉", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "truant", back: "不登校の、怠け者", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "vigilante", back: "自警団員", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "memorabilia", back: "記念品、思い出の品", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "rabies", back: "狂犬病", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "incision", back: "切り口、切開", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "profanity", back: "冒涜的な言葉、暴言", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "bowl over", back: "圧倒する、驚かせる", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "roll out", back: "本格導入する、展開する", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "tide over", back: "乗り切る、しのぐ", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "engross", back: "没頭させる、夢中にさせる", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "harangue", back: "熱弁、大演説", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "Sagitta", back: "や座 (矢座)", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "Pyxis", back: "らしんばん座 (羅針盤座)", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "Fornax", back: "ろ座 (炉座)", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "Pavo", back: "くじゃく座 (孔雀座)", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
      { front: "Crux", back: "みなみじゅうじ座 (南十字座)", memo: "", createdAt: "2026-07-09T12:55:12+09:00", lastEdited: "2026-07-09T12:55:12+09:00", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 14, objStability: 133 },
    ] 
  },
  {
    name: "英単語",
    folders: [],
    cards: [
      // 「英単語」直下のカード群
      { front: "apple", back: "りんご", memo: "サンプルカードです", createdAt: "2024-01-01T00:00:00.000Z", lastEdited: "2024-01-01T00:00:00.000Z", nextTestTime: NaN, memorizationLevel: 0, C1: 1.0, C2: 1.5, objRememberTime: 0, objStability: 0 },
    ]
  }
];

const initialCardsData: Folder[] = addUuidsRecursively(initialCardsDataRaw);

let cardsData: Folder[] = initialCardsData;

function setMonitorT0(folders: Folder[], timestamp: string, overwrite = true): void {
  const monitorFolder = folders.find(folder => folder.name === "モニター用単語");
  monitorFolder?.cards.forEach(card => {
    if (overwrite || !card.T0) {
      card.T0 = timestamp;
      card.initialReviewCompleted = false;
    }
  });
}

// データを保存する
export async function saveCardsData(): Promise<void> {
  try {
    const jsonValue = JSON.stringify(cardsData);
    await AsyncStorage.setItem(STORAGE_KEY, jsonValue);
  } catch (e) {
    console.error('Failed to save cards data', e);
  }
}

// データを読み込む
export async function loadCardsData(): Promise<Folder[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    if (jsonValue !== null) {
      const parsed = JSON.parse(jsonValue);
      cardsData = addUuidsRecursively(parsed);

      // 自動マイグレーション: 「モニター用単語」が「英単語」の中にある場合はルート直下に移動
      let monitorFolder = cardsData.find(f => f.name === "モニター用単語");
      const englishFolder = cardsData.find(f => f.name === "英単語");
      if (englishFolder) {
        const nestedMonitorIdx = englishFolder.folders.findIndex(f => f.name === "モニター用単語");
        if (nestedMonitorIdx !== -1) {
          const [nestedMonitor] = englishFolder.folders.splice(nestedMonitorIdx, 1);
          if (!monitorFolder) {
            cardsData.unshift(nestedMonitor);
            monitorFolder = nestedMonitor;
          }
        }
      }

      if (monitorFolder) {
        if (monitorFolder.cards.length === 0 || monitorFolder.cards[0].front !== "incongruous") {
          const initialMonitor = initialCardsData.find(f => f.name === "モニター用単語");
          if (initialMonitor) {
            monitorFolder.cards = initialMonitor.cards;
          }
        }
      }

      // 保存済みデータでも、モニター用単語に T0 がなければ、この起動日を初期値にする。
      setMonitorT0(cardsData, new Date().toISOString(), false);
      await saveCardsData();
    } else {
      cardsData = addUuidsRecursively(JSON.parse(JSON.stringify(initialCardsDataRaw)));
      setMonitorT0(cardsData, new Date().toISOString());
      await saveCardsData();
    }
    return cardsData;
  } catch (e) {
    console.error('Failed to load cards data', e);
    return cardsData;
  }
}

export function getCardsData(): Folder[] {
  return cardsData;
}

// 再帰的にタイムスタンプを更新する関数（T0 はモニター用単語だけ別途更新）
function updateTimestampsRecursively(folders: Folder[], timestamp: string): void {
  for (const folder of folders) {
    for (const card of folder.cards) {
      card.createdAt = timestamp;
      card.lastEdited = timestamp;
    }
    updateTimestampsRecursively(folder.folders, timestamp);
  }
}

// データを初期状態にリセットする
export async function resetCardsData(): Promise<void> {
  const resetData = JSON.parse(JSON.stringify(initialCardsData));
  const currentTimestamp = new Date().toISOString();
  updateTimestampsRecursively(resetData, currentTimestamp);
  setMonitorT0(resetData, currentTimestamp);
  cardsData = resetData;
  await saveCardsData();
  await resetGoalsData();
}

// 現在のフォルダに入っているデータを取得
export function findCurrentFoldersData(currentFolder: string[], data: Folder[]): Folder[] {
  let currentData = data;
  for (const folderName of currentFolder) {
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return [];
    currentData = folder.folders;
  }
  return currentData;
}

// 現在のフォルダに入っているカードを取得
export function findCurrentCardsData(currentFolder: string[], data: Folder[]): Card[] {
  let currentData = data;
  let index = 0;
  for (const folderName of currentFolder) {
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return [];
    if (index === currentFolder.length - 1) return folder.cards;
    currentData = folder.folders;
    index++;
  }
  return [];
}

export function createFolderList(data: Folder[]): string[] {
  return data.map((item) => item.name);
}

/**
 * テキストが右から左に書く言語（アラビア語など）であるかを判定する
 */
export function isRTL(text: string): boolean {
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
  return rtlRegex.test(text);
}

// カードをindexで取得する
export function getCard(folderPath: string[], cardIndex: number): Card | undefined {
  const cards = findCurrentCardsData(folderPath, cardsData);
  return cards[cardIndex];
}

// カードを更新する
export function updateCard(folderPath: string[], cardIndex: number, updatedCard: Card): boolean {
  let currentData = cardsData;
  for (const folderName of folderPath) {
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return false;
    if (folderName === folderPath[folderPath.length - 1]) {
      if (!folder.cards[cardIndex]) return false;
      folder.cards[cardIndex] = updatedCard;
      saveCardsData(); // 非同期で保存を開始
      return true;
    }
    currentData = folder.folders;
  }
  return false;
}

// カードを削除する
export function deleteCard(folderPath: string[], cardIndex: number): boolean {
  let currentData = cardsData;
  for (const folderName of folderPath) {
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return false;
    if (folderName === folderPath[folderPath.length - 1]) {
      if (!folder.cards[cardIndex]) return false;
      folder.cards.splice(cardIndex, 1);
      saveCardsData(); // 非同期で保存を開始
      return true;
    }
    currentData = folder.folders;
  }
  return false;
}

// カードを並び替える
export function reorderCards(folderPath: string[], fromIndex: number, toIndex: number): boolean {
  let currentData = cardsData;
  if (folderPath.length === 0) return false;
  for (let i = 0; i < folderPath.length; i++) {
    const folderName = folderPath[i];
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return false;
    if (i === folderPath.length - 1) {
      const cards = folder.cards;
      if (fromIndex < 0 || fromIndex >= cards.length || toIndex < 0 || toIndex >= cards.length) {
        return false;
      }
      const [movedCard] = cards.splice(fromIndex, 1);
      cards.splice(toIndex, 0, movedCard);
      saveCardsData();
      return true;
    }
    currentData = folder.folders;
  }
  return false;
}

// カードを追加する
export function addCard(folderPath: string[], newCard: Card): boolean {
  let currentData = cardsData;
  if (folderPath.length === 0) {
    return false;
  }
  for (let i = 0; i < folderPath.length; i++) {
    const folderName = folderPath[i];
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return false;
    if (i === folderPath.length - 1) {
      folder.cards.push(newCard);
      saveCardsData();
      return true;
    }
    currentData = folder.folders;
  }
  return false;
}

// フォルダを追加する
export function addFolder(folderPath: string[], newFolderName: string): boolean {
  const newFolder: Folder = {
    uuid: generateUUID(),
    name: newFolderName,
    folders: [],
    cards: [],
  };

  if (folderPath.length === 0) {
    cardsData.push(newFolder);
    saveCardsData();
    return true;
  }

  let currentData = cardsData;
  for (let i = 0; i < folderPath.length; i++) {
    const folderName = folderPath[i];
    const folder = currentData.find((f): f is Folder => f.name === folderName);
    if (!folder) return false;
    if (i === folderPath.length - 1) {
      if (!folder.folders) {
        folder.folders = [];
      }
      folder.folders.push(newFolder);
      saveCardsData();
      return true;
    }
    currentData = folder.folders;
  }
  return false;
}

export type TestCard = {
  card: Card;
  originalFolderPath: string[];
  originalIndex: number;
};

// 目標日数0は「目標設定なし」。T0を持つモニター用カードは従来どおり対象にする。
export function hasReviewTarget(card: Card): boolean {
  return Boolean(card.T0) || (card.objRememberTime ?? 14) > 0;
}

// 再帰的に TestCard を収集するヘルパー
function collectTestCardsRecursively(folder: Folder, currentPath: string[]): TestCard[] {
  let results: TestCard[] = folder.cards.map((card, index) => ({
    card,
    originalFolderPath: currentPath,
    originalIndex: index,
  }));

  for (const subfolder of folder.folders) {
    const subPath = [...currentPath, subfolder.name];
    results = results.concat(collectTestCardsRecursively(subfolder, subPath));
  }
  
  return results;
}

// 指定したパスからテスト用のカードを収集する
export function getTestCardsForPath(folderPath: string[], includeSubfolders: boolean): TestCard[] {
  let currentData = getCardsData();
  
  // フォルダ階層をたどる
  let currentFolder: Folder | undefined = undefined;
  for (const folderName of folderPath) {
    if (!currentFolder) {
      currentFolder = currentData.find(f => f.name === folderName);
    } else {
      currentFolder = currentFolder.folders.find(f => f.name === folderName);
    }
    if (!currentFolder) return [];
  }

  // ルートフォルダの場合（folderPath が空配列）
  if (folderPath.length === 0) {
    let allTestCards: TestCard[] = [];
    for (const f of currentData) {
      if (includeSubfolders) {
        if (f.name === 'モニター用単語') continue;
        allTestCards = allTestCards.concat(collectTestCardsRecursively(f, [f.name]));
      }
    }
    return allTestCards.filter(item =>
      !item.originalFolderPath.includes('モニター用単語')
      && hasReviewTarget(item.card)
    );
  }

  if (!currentFolder) return [];

  if (includeSubfolders) {
    return collectTestCardsRecursively(currentFolder, folderPath)
      .filter(item => hasReviewTarget(item.card));
  } else {
    return currentFolder.cards
      .map((card, index) => ({
        card,
        originalFolderPath: folderPath,
        originalIndex: index,
      }))
      .filter(item => hasReviewTarget(item.card));
  }
}

/**
 * 指定されたフォルダおよび配下の全サブフォルダ内の全カードに対し、
 * 目標記憶日数 (objRememberTime) と目標記憶安定性 (objStability) を一括更新する
 */
export function updateFolderCardSettings(
  folderPath: string[],
  objRememberTime: number,
  objStability: number
): boolean {
  const goalSetAt = new Date().toISOString();

  const updateRecursively = (f: Folder) => {
    f.cards.forEach(c => {
      // 通常カードで初めて目標を設定するときだけ、その日を復習計算の起点にする。
      if (!c.T0 && (c.objRememberTime ?? 14) <= 0 && objRememberTime > 0) {
        c.createdAt = goalSetAt;
      }

      c.objRememberTime = objRememberTime;
      c.objStability = objStability;
    });
    if (f.folders) {
      f.folders.forEach(sub => updateRecursively(sub));
    }
  };

  if (folderPath.length === 0) {
    cardsData.forEach(f => updateRecursively(f));
    saveCardsData();
    return true;
  }

  let currentFolder: Folder | undefined = undefined;
  let currentData = cardsData;
  for (const folderName of folderPath) {
    if (!currentFolder) {
      currentFolder = currentData.find(f => f.name === folderName);
    } else {
      currentFolder = currentFolder.folders.find(f => f.name === folderName);
    }
    if (!currentFolder) return false;
  }

  if (currentFolder) {
    updateRecursively(currentFolder);
    saveCardsData();
    return true;
  }

  return false;
}

/**
 * フォルダ設定の一括更新（フォルダ名変更 ＋ 目標記憶日数・安定性の一括更新）
 */
export function updateFolderSettings(
  folderPath: string[],
  newFolderName: string,
  objRememberTime: number,
  objStability: number
): { success: boolean; errorReason?: 'duplicate' | 'notFound' | 'monitorFolder' } {
  if (folderPath.length === 0) return { success: false, errorReason: 'notFound' };

  const oldFolderName = folderPath[folderPath.length - 1];
  if (oldFolderName === 'モニター用単語') {
    return { success: false, errorReason: 'monitorFolder' };
  }

  // 配下カードの数理パラメータ一括更新
  updateFolderCardSettings(folderPath, objRememberTime, objStability);

  const trimmedNewName = newFolderName.trim();
  if (trimmedNewName && trimmedNewName !== oldFolderName) {
    const parentPath = folderPath.slice(0, folderPath.length - 1);
    let currentData = cardsData;

    if (parentPath.length > 0) {
      let currentFolder: Folder | undefined = undefined;
      for (const folderName of parentPath) {
        if (!currentFolder) {
          currentFolder = currentData.find(f => f.name === folderName);
        } else {
          currentFolder = currentFolder.folders.find(f => f.name === folderName);
        }
        if (!currentFolder) return { success: false, errorReason: 'notFound' };
      }
      if (currentFolder) {
        currentData = currentFolder.folders;
      }
    }

    if (currentData.some(f => f.name === trimmedNewName)) {
      return { success: false, errorReason: 'duplicate' };
    }

    const folderToRename = currentData.find(f => f.name === oldFolderName);
    if (folderToRename) {
      folderToRename.name = trimmedNewName;
      saveCardsData();
    }
  }

  return { success: true };
}

export type ScheduledTestItem = {
  testNumber: number; // 何回目のテストか (1-indexed)
  timestamp: number;  // テストの予定時刻 [ms]
  dateKey: string;    // 'YYYY-MM-DD'
};

/**
 * test.tsx の計算式 (ti = dateCreated + C1 * (C2^(i-1)) [日]) に基づき、
 * 今後のテスト予定時刻 (t_i, t_i + t_{i+1}, t_i + t_{i+1} + t_{i+2}...) とそのテスト回数を求める
 */
export function getCardScheduledTests(card: Card, maxCount: number = 50): ScheduledTestItem[] {
  if (!hasReviewTarget(card)) return [];

  const historyCount = card.testHistory?.length || 0;
  const hasEstablishedParameters = historyCount >= 2;
  const C1 = hasEstablishedParameters ? (card.C1 ?? 1.0) : 1.0;
  const C2 = hasEstablishedParameters ? (card.C2 ?? 1.5) : 1.5;
  const baseDate = new Date(card.T0 ?? card.createdAt);
  const baseMs = baseDate.getTime();
  const objRememberTime = card.objRememberTime ?? 14;
  const objRememberMs = baseMs + (objRememberTime + 1) * 24 * 60 * 60 * 1000;

  const schedules: ScheduledTestItem[] = [];

  let reachedEnd = false;
  // console.log(`${card.front} basedate${baseDate.getFullYear()}-${baseDate.getMonth()}${baseDate.getDate()}`)

  // ★ 1. T0日の初回復習が未完了なら「0回目」として追加
  const initialReviewMs = baseMs;
  if (
    historyCount === 0
    && card.initialReviewCompleted !== true
    && !isNaN(initialReviewMs)
  ) {
    const d0 = new Date(initialReviewMs);
    if (!isNaN(d0.getTime())) {
      const yyyy = d0.getFullYear();
      const mm = String(d0.getMonth() + 1).padStart(2, '0');
      const dd = String(d0.getDate()).padStart(2, '0');
      schedules.push({
        testNumber: 0, // 0回目（T0当日。T0がなければ作成日当日）
        timestamp: initialReviewMs,
        dateKey: `${yyyy}-${mm}-${dd}`,
      });
    }
  }

  // ★ 2. 直近の復習が未完了なら、同じ復習日を再提示
  const lastResult = historyCount > 0 ? card.testHistory?.[historyCount - 1] : undefined;
  if (lastResult?.isStudied === false) {
    const incompleteDate = new Date(lastResult.timestamp);
    if (!isNaN(incompleteDate.getTime())) {
      const yyyy = incompleteDate.getFullYear();
      const mm = String(incompleteDate.getMonth() + 1).padStart(2, '0');
      const dd = String(incompleteDate.getDate()).padStart(2, '0');
      schedules.push({
        testNumber: historyCount,
        timestamp: incompleteDate.getTime(),
        dateKey: `${yyyy}-${mm}-${dd}`,
      });
    }
  }

  // ★ 3. 1回目以降の復習スケジュールを計算
  for (let step = 1; step <= maxCount; step++) {
    const i = historyCount + step; // i 回目の復習テスト

    // C1・C2が未確定の間は、仮値で0～2回目までだけ予定を作る
    if (!hasEstablishedParameters && i > 2){
      reachedEnd = true;
      break;
    }
    // 累積日数を計算
    let totalDeltaDays = 0;
    for (let k = 1; k <= i; k++) {
      totalDeltaDays += C1 * Math.pow(C2, k - 1);
    }

    const ti = baseMs + totalDeltaDays * 24 * 60 * 60 * 1000;

    if (!isNaN(ti) && ti < objRememberMs) {
      const d = new Date(ti);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        schedules.push({
          testNumber: i,
          timestamp: ti,
          dateKey: `${yyyy}-${mm}-${dd}`,
        });
        console.log(`${yyyy}-${mm}-${dd}`)
      }
    } else {
      const d = new Date(objRememberMs);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      // console.log(`${yyyy}-${mm}-${dd}`)
      schedules.push({
          testNumber: i,
          timestamp: objRememberMs,
          dateKey: `last${yyyy}-${mm}-${dd}`,
      });
      reachedEnd = true;
      break;
    }
  }
  // もし maxCount に達しても objRememberMs に届かなかった場合のフォロー
  if (!reachedEnd) {
    const d = new Date(objRememberMs);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    schedules.push({
      testNumber: historyCount + maxCount + 1,
      timestamp: objRememberMs,
      dateKey: `${yyyy}-${mm}-${dd}`,
    });
  }

  return schedules;
}

/**
 * 指定したパスのフォルダを削除する
 */
export function deleteFolder(
  folderPath: string[]
): { success: boolean; errorReason?: 'notFound' | 'monitorFolder' } {
  if (folderPath.length === 0) return { success: false, errorReason: 'notFound' };

  const targetFolderName = folderPath[folderPath.length - 1];
  if (targetFolderName === 'モニター用単語') {
    return { success: false, errorReason: 'monitorFolder' };
  }

  const parentPath = folderPath.slice(0, folderPath.length - 1);
  let currentData = cardsData;

  if (parentPath.length > 0) {
    let currentFolder: Folder | undefined = undefined;
    for (const folderName of parentPath) {
      if (!currentFolder) {
        currentFolder = currentData.find(f => f.name === folderName);
      } else {
        currentFolder = currentFolder.folders.find(f => f.name === folderName);
      }
      if (!currentFolder) return { success: false, errorReason: 'notFound' };
    }
    if (currentFolder) {
      currentData = currentFolder.folders;
    }
  }

  const index = currentData.findIndex(f => f.name === targetFolderName);
  if (index !== -1) {
    currentData.splice(index, 1);
    saveCardsData();
    return { success: true };
  }

  return { success: false, errorReason: 'notFound' };
}

export type SharedCard = {
  front: string;
  back: string;
  memo: string;
};

export type SharedFolder = {
  name: string;
  cards: SharedCard[];
  folders?: SharedFolder[];
};

/**
 * 共有用にフォルダ内のすべてのカードデータを "front", "back", "memo" のみに絞り込んで取得
 */
export function getSharedFolderData(folderPath: string[]): SharedFolder | null {
  if (folderPath.length === 0) return null;

  let currentFolder: Folder | undefined = undefined;
  let currentData = cardsData;
  for (const folderName of folderPath) {
    if (!currentFolder) {
      currentFolder = currentData.find(f => f.name === folderName);
    } else {
      currentFolder = currentFolder.folders.find(f => f.name === folderName);
    }
    if (!currentFolder) return null;
  }

  if (!currentFolder) return null;

  const formatFolder = (f: Folder): SharedFolder => ({
    name: f.name,
    cards: (f.cards || []).map(c => ({
      front: c.front || '',
      back: c.back || '',
      memo: c.memo || '',
    })),
    folders: (f.folders || []).map(sub => formatFolder(sub)),
  });

  return formatFolder(currentFolder);
}

/**
 * 共有フォルダ（SharedFolder）をローカルの cardsData に変換して取り込み保存する
 */
export function importSharedFolder(
  sharedFolder: SharedFolder,
  targetFolderPath: string[] = []
): { success: boolean; importedName: string } {
  const now = new Date().toISOString();

  const convertSharedFolder = (sf: SharedFolder): Folder => {
    return {
      name: sf.name,
      cards: (sf.cards || []).map(sc => ({
        uuid: generateUUID(),
        front: sc.front || '',
        back: sc.back || '',
        memo: sc.memo || '',
        memorizationLevel: 0,
        objRememberTime: 0,
        objStability: 133,
        createdAt: now,
        lastEdited: now,
      })),
      folders: (sf.folders || []).map(sub => convertSharedFolder(sub)),
    };
  };

  let targetData = cardsData;
  if (targetFolderPath.length > 0) {
    let currentFolder: Folder | undefined = undefined;
    for (const name of targetFolderPath) {
      if (!currentFolder) {
        currentFolder = targetData.find(f => f.name === name);
      } else {
        currentFolder = currentFolder.folders.find(f => f.name === name);
      }
      if (!currentFolder) break;
    }
    if (currentFolder) {
      targetData = currentFolder.folders;
    }
  }

  let folderName = sharedFolder.name;
  let counter = 1;
  while (targetData.some(f => f.name === folderName)) {
    folderName = `${sharedFolder.name} (${counter})`;
    counter++;
  }

  const newFolder = convertSharedFolder(sharedFolder);
  newFolder.name = folderName;

  targetData.push(newFolder);
  saveCardsData();

  return { success: true, importedName: folderName };
}

/**
 * 2つの日時が同じ日（年月日）かどうかを判定するヘルパー関数
 */
export function isSameDay(d1: Date | string | number, d2: Date | string | number): boolean {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 指定日にカードが復習完了済みかを判定する。
 * T0日の完了状態はカード直下、それ以外はテスト履歴の isStudied を参照する。
 */
export function isCardStudiedOnDate(
  card: Card,
  targetDate: Date | string | number,
): boolean {
  const normalizedTargetDate = typeof targetDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ? (() => {
      const [year, month, day] = targetDate.split('-').map(Number);
      return new Date(year, month - 1, day);
    })()
    : new Date(targetDate);

  if (Number.isNaN(normalizedTargetDate.getTime())) return false;

  const initialReviewAt = card.T0 ?? card.createdAt;
  if (
    card.initialReviewCompleted === true
    && isSameDay(initialReviewAt, normalizedTargetDate)
  ) {
    return true;
  }

  return card.testHistory?.some(result => (
    result.isStudied === true
    && isSameDay(result.timestamp, normalizedTargetDate)
  )) ?? false;
}

/**
 * 本日の日付文字列（YYYY-MM-DD）を取得する
 */
export function getTodayDateStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * フォルダ名またはパスが「モニター用単語」フォルダかを判定する
 */
export function isMonitorFolder(folderNameOrPath: string | string[]): boolean {
  if (Array.isArray(folderNameOrPath)) {
    return folderNameOrPath.some(name => name === 'モニター用単語');
  }
  return folderNameOrPath === 'モニター用単語';
}

/**
 * モニター用単語フォルダが本日の復習予定に含まれているかを判定する。
 * （いずれかのカードに本日 (todayStr) の復習スケジュールがあり、未完了であるか）
 */
export function isMonitorFolderScheduledForToday(folderPath: string[] = ['モニター用単語']): boolean {
  const todayStr = getTodayDateStr();
  const testCards = getTestCardsForPath(folderPath, true);
  for (const item of testCards) {
    const schedules = getCardScheduledTests(item.card, 3);
    if (schedules.some(s => s.dateKey <= todayStr)) {
      return true;
    }
  }
  return false;
}

