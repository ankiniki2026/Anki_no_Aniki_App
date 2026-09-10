# 暗記のアニキ (Aniki d’Anki)

![React Native](https://img.shields.io/badge/React_Native-0.81-blue.svg)
![Expo](https://img.shields.io/badge/Expo-54-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**[「暗記のアニキ」](https://ankiniki2026.web.app/)** は、単語学習や資格・検定試験の勉強など、あらゆる暗記作業を効率化・自動化するモバイルアプリケーションです。  
ユーザーの学習目標日に合わせた**自動復習スケジューリング**、**OCR（画像文字認識）による単語カード生成**、**オンライン共有機能**などを備えたオールインワン暗記学習ツールです。

---

## 🌟 主な特徴・機能

### 1. 🤖 自動スケジューリング（忘却曲線・目標日対応）
- ユーザーがカードを覚える目標日（または検定日など）を設定するだけで、アプリが最適化された復習間隔を自動算出します。
- 進捗率に基づき、今日やるべき復習カードを自動で配信します。

### 2. 📸 OCR / AI 画像文字読み取り機能
- 参考書やノートの写真を撮影・アップロードするだけで、テキスト（単語・意味）を自動抽出。
- 手動タイピング不要で、瞬時に単語カード化・単語帳登録が可能です（Tesseract.js / OpenAI連携）。

### 3. 📚 単語帳・カード管理 & CSVインポート/エクスポート
- 直感的な操作でカードの追加・編集・ドラッグ＆ドロップ並べ替えが可能。
- CSVファイルからのバッチ登録やエクスポートに対応しており、大量の単語データも一括管理できます。

### 4. 🌐 フォルダ＆単語帳のオンライン共有機能
- 作成した単語帳やフォルダをFirebase経由で他のユーザーと共有（共有コード発行・ダウンロード）。
- 友達やグループ間で単語カードをスムーズにシェアできます。

### 5. 🎯 多角的なテスト＆学習モード
- **4択テスト** や **入力テスト** など複数の学習モードを搭載。
- **音声読み上げ (TTS)** による発音確認・音声学習。
- 正誤判定や解答履歴のトラッキング。

### 6. 📊 学習分析＆統計グラフ
- 日々の学習量や暗記率をグラフで可視化（Victory Native / Chart Kit）。
- カレンダー表示で過去の学習履歴・連続学習ストリークを確認できます。

### 7. 🔔 復習リマインダー通知
- 忘れてしまいがちな復習タイミングをローカル通知で自動リマインド。

---

## 🛠 テクノロジー・構成

- **フレームワーク**: [React Native](https://reactnative.dev/) (v0.81), [Expo](https://expo.dev/) (v54), [Expo Router](https://docs.expo.dev/router/introduction/)
- **言語**: TypeScript
- **データベース / クラウド**: Firebase (Firestore / Storage)
- **状態管理・ストレージ**: AsyncStorage, Custom React Context (`cardsStore`, `themeContext`, `languageContext`)
- **OCR / 画像解析**: Tesseract.js, OpenAI API
- **UI / データ可視化**: React Native Reanimated, Victory Native, React Native Chart Kit, React Native Calendars
- **音声・通知**: `expo-speech`, `expo-notifications`, `expo-haptics`

---

## 🚀 開発・起動方法

### 前提条件
- Node.js (v18以上推奨)
- npm または yarn
- Expo Go アプリ（実機テスト）または iOS / Android エミュレータ

### セットアップ手順

1. **リポジトリのクローン**
   ```bash
   git clone https://github.com/ankiniki2026/wordApp.git
   cd wordapp
   ```

2. **パッケージのインストール**
   ```bash
   npm install
   ```

3. **開発サーバーの起動**
   ```bash
   npm start
   # または
   npx expo start
   ```

4. **アプリの実行**
   - ターミナルに表示されるQRコードを **Expo Go** アプリで読み取るか、キーボードで `a` (Android) または `i` (iOS) を押してエミュレータを起動します。

---

## 📄 ライセンス

暗記のアニキのソースコードは研究・学術用途に限り使用可能です。商業目的での使用はできません。

For research / academic use only.
Not for commercial use.

---

## 🔗 関連リンク

- [暗記のアニキ App Store](https://apps.apple.com/jp/app/%E6%9A%97%E8%A8%98%E3%81%AE%E3%82%A2%E3%83%8B%E3%82%AD/id6792623612)
- [暗記のアニキ ホームページ](https://ankiniki2026.web.app/)
- [暗記のアニキ 素材集](https://github.com/ankiniki2026/Anki_no_Aniki_Assets)

