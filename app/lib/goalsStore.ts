import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateFolderCardSettings } from './cardsStore';

export type UserGoal = {
  id: string;
  folderPath: string[]; // [] は全フォルダ
  folderName: string;   // 表示名
  targetDate: string;   // YYYY-MM-DD
  objRememberTime: number; // 目標記憶日数 (日)
  objStability: number;   // 目標記憶安定性
  createdAt: string;
};

const GOALS_STORAGE_KEY = 'user_goals_data';

export async function getGoals(): Promise<UserGoal[]> {
  try {
    const json = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    if (!json) {
      return [];
    }
    const goals = JSON.parse(json) as UserGoal[];
    // モニター用単語の目標が保存されていたらクリーンアップ
    const cleanedGoals = goals.filter(
      g => g.folderName !== 'モニター用単語' && !g.folderPath.includes('モニター用単語') && g.id !== 'default_monitor_goal'
    );
    if (cleanedGoals.length !== goals.length) {
      await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(cleanedGoals));
    }
    return cleanedGoals;
  } catch (e) {
    console.error('Failed to load goals:', e);
    return [];
  }
}

export async function saveGoal(input: {
  folderPath: string[];
  folderName: string;
  targetDate: string;
  objRememberTime: number;
  objStability: number;
}): Promise<UserGoal[]> {
  try {
    const currentGoals = await getGoals();
    
    // 同じ folderPath の目標が既にあれば更新、無ければ追加
    const pathKey = JSON.stringify(input.folderPath);
    const existingIndex = currentGoals.findIndex(g => JSON.stringify(g.folderPath) === pathKey);

    const newGoal: UserGoal = {
      id: existingIndex >= 0 ? currentGoals[existingIndex].id : 'goal_' + Date.now(),
      folderPath: input.folderPath,
      folderName: input.folderName,
      targetDate: input.targetDate,
      objRememberTime: input.objRememberTime,
      objStability: input.objStability,
      createdAt: new Date().toISOString(),
    };

    let updatedList: UserGoal[];
    if (existingIndex >= 0) {
      updatedList = [...currentGoals];
      updatedList[existingIndex] = newGoal;
    } else {
      updatedList = [...currentGoals, newGoal];
    }

    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(updatedList));

    // カードの数理モデルパラメータに一括反映
    updateFolderCardSettings(input.folderPath, input.objRememberTime, input.objStability);

    return updatedList;
  } catch (e) {
    console.error('Failed to save goal:', e);
    return [];
  }
}

export async function deleteGoal(id: string): Promise<UserGoal[]> {
  try {
    const currentGoals = await getGoals();
    const updatedList = currentGoals.filter(g => g.id !== id);
    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(updatedList));
    return updatedList;
  } catch (e) {
    console.error('Failed to delete goal:', e);
    return [];
  }
}

export async function resetGoalsData(): Promise<UserGoal[]> {
  try {
    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify([]));
    return [];
  } catch (e) {
    console.error('Failed to reset goals:', e);
    return [];
  }
}
