import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { triggerHaptic } from './haptic';

export type TutorialStep = {
  stepNumber: number;
  title: string;
  text: string;
  route: string;
  badge: string;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    stepNumber: 1,
    title: 'アプリの概要とフォルダ作成',
    text: 'ダウンロードありがとうございます！暗記のアニキは言語学習・資格取得などの、さまざまな勉強に使えるフラッシュカードアプリです。フォルダを作り、画像やCSV（カンマ区切り）のデータから、カードを取り込み管理します。カードフォルダの追加は「カード」の「＋」から行います。',
    route: '/cards',
    badge: '「カード」タブへ移動',
  },
  {
    stepNumber: 2,
    title: '「目標」の設定',
    text: '暗記のアニキの特徴は「目標」を設定すること！フォルダごとに期日となる「目標日」、最終的な達成率となる「目標記憶安定性」を設定することで、最適な復習日をご提案します。目標設定は「ホーム」の目標「＋」から行います。',
    route: '/',
    badge: '「ホーム」タブへ移動',
  },
  {
    stepNumber: 3,
    title: '復習予定とテスト',
    text: '目標が設定できたら、復習予定にフォルダが表示されます。今日の日付に表示されているフォルダを押し、「▶」からテストを行います。',
    route: '/',
    badge: '「ホーム」タブへ移動',
  },
  {
    stepNumber: 4,
    title: 'テストの進め方',
    text: 'テストではカードの表面が表示されます。裏面を思い出せたら「裏面を表示する」を選択し、「覚えた」を選択します。どうしても思い出せないときに限り、裏面を表示し復習し「覚えていない」を選択します。',
    route: '/',
    badge: '「ホーム」タブへ移動',
  },
  {
    stepNumber: 5,
    title: '繰り替えしの復習',
    text: 'カードは一定のスピードで「正解」できるまで、テストが提案されます。その日のテストがすべてなくなるまで繰り返しましょう。',
    route: '/',
    badge: '「ホーム」タブへ移動',
  },
  {
    stepNumber: 6,
    title: '最適な復習日の提案',
    text: '1日後、3日後のテストを実行すると、カードごとに復習日の提案がされます。毎日“必要なカードだけ”復習することで、目標を達成することができます。',
    route: '/',
    badge: '「ホーム」タブへ移動',
  },
  {
    stepNumber: 7,
    title: 'リマインド通知機能',
    text: '復習日はスマホの通知で知らせることもできます。一日の中でお知らせする時間は「設定」「通知時刻」から確認できます。',
    route: '',
    badge: '「設定」画面でお知らせ',
  },
  {
    stepNumber: 8,
    title: 'カレンダー画面',
    text: '「カレンダー」では、目標日すべてのフォルダの復習日を確認できます。',
    route: '/calendar',
    badge: '「カレンダー」タブへ移動',
  },
  {
    stepNumber: 9,
    title: '記憶変化のグラフ',
    text: '「グラフ」では、目標日までの、あなたの記憶の変化をフォルダごとに確認できます。',
    route: '/graph',
    badge: '「グラフ」タブへ移動',
  },
  {
    stepNumber: 10,
    title: 'フォルダの全体公開',
    text: '自分で作ったフォルダは「カード」の「=」から、全世界に公開することができます。',
    route: '/cards',
    badge: '「カード」タブへ移動',
  },
  {
    stepNumber: 11,
    title: '共有フォルダの取得',
    text: 'また、誰かが作った「共有」から、誰かが作ったフォルダをダウンロードすることができます。',
    route: '/shared',
    badge: '「共有」タブへ移動',
  },
  {
    stepNumber: 12,
    title: 'モニター用単語について',
    text: 'モニター用単語は、課題研究で開発した復習日提案アルゴリズムの評価のために、皆様に学習をお願いしている単語です。2週間だけですので、ご協力いただければ幸いです。',
    route: '/cards',
    badge: '「カード」タブへ移動',
  },
];

type TutorialContextType = {
  isTutorialOpen: boolean;
  currentStepIndex: number;
  autoNavigate: boolean;
  openTutorial: (startStep?: number) => void;
  closeTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  setAutoNavigate: (enable: boolean) => void;
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [autoNavigate, setAutoNavigate] = useState(true);
  const router = useRouter();

  const navigateToStepRoute = (stepIdx: number) => {
    const step = TUTORIAL_STEPS[stepIdx];
    if (step?.route && step.route !== '/settings') {
      try {
        router.push(step.route as any);
      } catch (e) {
        console.error('Tutorial navigation error:', e);
      }
    }
  };

  const openTutorial = (startStep: number = 0) => {
    triggerHaptic();
    setCurrentStepIndex(startStep);
    setIsTutorialOpen(true);
    navigateToStepRoute(startStep);
  };

  const closeTutorial = () => {
    triggerHaptic();
    setIsTutorialOpen(false);
    AsyncStorage.setItem('has_seen_tutorial', 'true');
  };

  const nextStep = () => {
    triggerHaptic();
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      navigateToStepRoute(nextIdx);
    } else {
      closeTutorial();
    }
  };

  const prevStep = () => {
    triggerHaptic();
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      navigateToStepRoute(prevIdx);
    }
  };

  const goToStep = (index: number) => {
    if (index >= 0 && index < TUTORIAL_STEPS.length) {
      triggerHaptic();
      setCurrentStepIndex(index);
      navigateToStepRoute(index);
    }
  };

  return (
    <TutorialContext.Provider
      value={{
        isTutorialOpen,
        currentStepIndex,
        autoNavigate,
        openTutorial,
        closeTutorial,
        nextStep,
        prevStep,
        goToStep,
        setAutoNavigate,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}
