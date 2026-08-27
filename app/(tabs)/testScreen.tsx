import { useState, useMemo } from 'react';
import { Platform, Text, View, StyleSheet, TextInput, Button, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { TabBar, useColors, shadow } from '../lib/colors';
import { resetCardsData } from '../lib/cardsStore';
import { useLanguage, Language } from '../lib/languageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerHaptic } from '../lib/haptic';

const generateData = (length: number = 10) =>
  Array.from({ length }, (_, index) => ({
    month: index + 1,
    listenCount: Math.floor(Math.random() * (100 - 50 + 1)) + 50,
    favouriteCount: Math.floor(Math.random() * (100 - 50 + 1)) + 20,
    sales: Math.floor(Math.random() * (100 - 50 + 1)) + 25,
  }));

export default function TestScreen() {
  const router = useRouter();
  const [word, setWord] = useState('');
  const [url, setUrl] = useState('');
  const colors = useColors();

  // データを固定（レンダリング毎に生成されないようにする）
  const chartData = useMemo(() => generateData(), []);

  const handleSearch = () => {
    triggerHaptic();
    if (!word) return;

    // YouGlish埋め込みURL
    const embedUrl = `https://youglish.com/pronounce/${word}/english?autoplay=1`;
    setUrl(embedUrl);
  };

  const handleReset = async () => {
    triggerHaptic();
    const confirmReset = () => {
      resetCardsData().then(() => {
        if (Platform.OS === 'web') {
          window.alert('データをリセットしました。');
        } else {
          Alert.alert('リセット', 'データをリセットしました。');
        }
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('データを初期状態にリセットしますか？')) {
        confirmReset();
      }
    } else {
      Alert.alert(
        'データのリセット',
        'すべてのカードとフォルダを初期状態に戻しますか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'リセット', style: 'destructive', onPress: confirmReset },
        ]
      );
    }
  };

  const handleFactoryReset = async () => {
    triggerHaptic();
    const confirmFactoryReset = () => {
      Promise.all([
        AsyncStorage.removeItem('has_consented'),
        AsyncStorage.removeItem('user_age'),
        resetCardsData()
      ]).then(() => {
        if (Platform.OS === 'web') {
          window.alert('アプリを初回起動時の状態に戻しました。再起動します。');
          window.location.reload();
        } else {
          Alert.alert(
            '初期化完了',
            'アプリを初期化しました。設定を反映するためにアプリを再起動してください。'
          );
        }
      }).catch((e) => {
        console.error(e);
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('アプリを完全に初回起動時の状態に戻しますか？（年齢や同意設定、カードデータがリセットされます）')) {
        confirmFactoryReset();
      }
    } else {
      Alert.alert(
        'アプリの完全初期化',
        'アプリを完全に初回起動時の状態に戻しますか？\n（年齢や同意設定、カードデータがリセットされます）',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '初期化する', style: 'destructive', onPress: confirmFactoryReset },
        ]
      );
    }
  };

const html = `
<!DOCTYPE html>
<html>
  <body>
    <div style="transform: scale(0.5); transform-origin: top;">
      <div id="yg-widget"></div>
    </div>

    <script src="https://youglish.com/public/emb/widget.js"></script>
    <script>
      new YG.Widget("yg-widget", {
        width: 2000,
        height: 600,

        query: "${word}",
        lang: "english",
        autoplay: 1
      });
    </script>
  </body>
</html>
`;

  return (
    <>
    <TabBar/>
    <View style={[styles.header, { backgroundColor: colors.element }]}>
      <Pressable onPress={() => { triggerHaptic(); router.replace('/'); }} style={styles.backButton}>
        <Ionicons name="arrow-back" size={28} color={colors.plainText} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.plainText }]}>テスト</Text>
    </View>
    <View style={styles.container}>
      <TextInput
        style={[styles.input, { color: colors.plainText, borderColor: colors.divider }]}
        placeholder="単語を入力"
        placeholderTextColor={colors.plainText + '80'}
        value={word}
        onChangeText={setWord}
      />
      <View style={{ marginHorizontal: 10 }}>
        <Button title="検索" onPress={handleSearch} />
      </View>

      <View style={styles.buttonWrapper}>
        <Pressable
          onPress={() => { triggerHaptic(); router.push('/testSettings'); }}
          style={({ pressed }) => [
            styles.liquidButtonContainer,
            {
              backgroundColor: colors.element + 'B0',
              borderColor: 'rgba(255, 255, 255, 0.25)',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            }
          ]}
        >
          <View style={styles.glassHighlight} />
          <View style={styles.buttonContent}>
            <Ionicons name="play-circle" size={24} color="#007AFF" style={{ marginRight: 8 }} />
            <Text style={styles.liquidButtonText}>テストを開始する</Text>
          </View>
        </Pressable>
      </View>

      <View style={{ marginTop: 20, paddingHorizontal: 20 }}>
        <Button title="データをリセット (デバッグ用)" color="#ff4444" onPress={handleReset} />
      </View>

      <View style={{ marginTop: 10, paddingHorizontal: 20 }}>
        <Button title="アプリを完全初期化 (初回起動状態にする)" color="#ff8800" onPress={handleFactoryReset} />
      </View>

      {url !== '' && (
        Platform.OS === 'web' ? (
          <iframe
            srcDoc={html}
            style={{ width: '100%', height: '500px', border: 'none', marginTop: 20 }}
          />
        ) : (
          <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />
        )
      )}
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 50,
    ...shadow,
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    left: 10,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    paddingTop: 20,
    backgroundColor: 'transparent',
  },
  input: {
    height: 40,
    borderWidth: 1,
    margin: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  webview: {
    flex: 1,
    marginTop: 10,
  },
  buttonWrapper: {
    padding: 20,
    alignItems: 'center',
  },
  liquidButtonContainer: {
    width: '85%',
    maxWidth: 320,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#007AFF', // ネオン調の青いシャドウ
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    position: 'relative',
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // 光沢反射
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  buttonContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  liquidButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
    letterSpacing: 0.5,
  },
});
