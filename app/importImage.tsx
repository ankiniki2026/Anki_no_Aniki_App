import Ionicons from '@expo/vector-icons/Ionicons';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useLanguage } from './lib/languageContext';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { addCard, Card, generateUUID } from './lib/cardsStore';
import { boldWeight, shadow, TabBar, useColors } from './lib/colors';
import {
  ExtractedTerm,
  OcrToken,
  extractTermsFromText,
  extractTermsFromTokens,
  normalizeWord,
} from '../lib/termExtractor';

type TesseractWord = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  line?: { id?: number; text?: string };
};

type TesseractData = {
  text?: string;
  words?: TesseractWord[];
  tsv?: string;
};

type OcrSpaceWord = {
  WordText?: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
};

type OcrSpaceLine = {
  LineText?: string;
  Words?: OcrSpaceWord[];
};

type OcrSpaceParsedResult = {
  ParsedText?: string;
  TextOverlay?: {
    Lines?: OcrSpaceLine[];
  };
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: OcrSpaceParsedResult[];
};

type ExtractionTarget = 'word' | 'phrase';

type OcrImageInput = {
  uri: string;
  base64?: string;
  mimeType?: string;
};

type MyMemoryResponse = {
  responseData?: {
    translatedText?: string;
  };
  responseStatus?: number;
  responseDetails?: string;
};

const OCR_LANGUAGES = 'eng';
const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_SPACE_API_KEY = process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY || 'helloworld';
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const MYMEMORY_EMAIL = process.env.EXPO_PUBLIC_MYMEMORY_EMAIL;
const MIN_RETRY_CONFIDENCE = 58;
const translationCache = new Map<string, string>();

function tsvWordRows(tsv?: string): string[][] {
  if (!tsv) return [];
  const rows = tsv.trim().split(/\r?\n/);
  if (!rows.length) return [];

  const firstRow = rows[0].split('\t');
  const hasHeader = firstRow.includes('level') && firstRow.includes('text');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows
    .map(row => row.split('\t'))
    .filter(cols => cols[0] === '5' && cols[11]?.trim());
}

function recognizedWordCount(data: TesseractData): number {
  const words = data.words?.filter(word => word.text?.trim()).length || 0;
  return words || tsvWordRows(data.tsv).length;
}

function averageWordConfidence(data: TesseractData): number {
  const confidences = (data.words || [])
    .map(word => word.confidence)
    .filter((confidence): confidence is number => Number.isFinite(confidence));
  if (!confidences.length && data.tsv) {
    const tsvConfidences = tsvWordRows(data.tsv)
      .map(cols => Number(cols[10]))
      .filter(confidence => Number.isFinite(confidence) && confidence >= 0);
    if (tsvConfidences.length) {
      return tsvConfidences.reduce((sum, confidence) => sum + confidence, 0) / tsvConfidences.length;
    }
  }
  if (!confidences.length) return 0;
  return confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
}

async function loadImageElement(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for OCR preprocessing.'));
    image.src = uri;
  });
}

async function preprocessImageForOcr(uri: string): Promise<string> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return uri;

  const image = await loadImageElement(uri);
  const maxSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const targetMaxSide = 2600;
  const targetMinSide = 1600;
  const scale = maxSide < targetMinSide
    ? Math.min(3, targetMinSide / Math.max(1, maxSide))
    : Math.min(1, targetMaxSide / Math.max(1, maxSide));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return uri;

  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    total += gray;
  }
  const mean = total / Math.max(1, data.length / 4);
  const contrast = mean < 150 ? 1.45 : 1.25;
  const brightness = mean < 115 ? 22 : 8;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const corrected = Math.max(0, Math.min(255, (gray - 128) * contrast + 128 + brightness));
    data[index] = corrected;
    data[index + 1] = corrected;
    data[index + 2] = corrected;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function tokensFromTsv(tsv: string): OcrToken[] {
  const rows = tsv.trim().split(/\r?\n/);
  if (!rows.length) return [];

  const firstRow = rows[0].split('\t');
  const hasHeader = firstRow.includes('level') && firstRow.includes('text');
  const header = hasHeader
    ? firstRow
    : ['level', 'page_num', 'block_num', 'par_num', 'line_num', 'word_num', 'left', 'top', 'width', 'height', 'conf', 'text'];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const column = (name: string) => header.indexOf(name);
  const levelIndex = column('level');
  const blockIndex = column('block_num');
  const paragraphIndex = column('par_num');
  const lineIndex = column('line_num');
  const wordIndex = column('word_num');
  const leftIndex = column('left');
  const topIndex = column('top');
  const widthIndex = column('width');
  const heightIndex = column('height');
  const confidenceIndex = column('conf');
  const textIndex = column('text');

  if ([levelIndex, lineIndex, wordIndex, leftIndex, topIndex, widthIndex, heightIndex, confidenceIndex, textIndex].some(index => index < 0)) {
    return [];
  }

  const rawTokens = dataRows
    .map(row => row.split('\t'))
    .filter(cols => cols[levelIndex] === '5' && cols[textIndex]?.trim())
    .map((cols, index) => {
      const lineKey = [
        cols[blockIndex] || '0',
        cols[paragraphIndex] || '0',
        cols[lineIndex] || '0',
      ].join(':');
      return {
        text: cols[textIndex].trim(),
        clean: normalizeWord(cols[textIndex] || ''),
        lineKey,
        wordNumber: Number(cols[wordIndex]) || index,
        confidence: Number(cols[confidenceIndex]),
        bbox: {
          x: Number(cols[leftIndex]) || 0,
          y: Number(cols[topIndex]) || 0,
          width: Number(cols[widthIndex]) || 0,
          height: Number(cols[heightIndex]) || 0,
        },
      };
    });

  const lineKeys = [...new Set(rawTokens.map(token => token.lineKey))];
  const lineIndexByKey = new Map(lineKeys.map((key, index) => [key, index]));
  const lineTextByKey = new Map<string, string>();
  rawTokens.forEach(token => {
    const existing = lineTextByKey.get(token.lineKey);
    lineTextByKey.set(token.lineKey, existing ? `${existing} ${token.text}` : token.text);
  });

  return rawTokens.map(token => ({
    text: token.text,
    clean: token.clean,
    lineIndex: lineIndexByKey.get(token.lineKey) || 0,
    tokenIndex: token.wordNumber,
    line: lineTextByKey.get(token.lineKey) || token.text,
    confidence: Number.isFinite(token.confidence) ? token.confidence : 65,
    bbox: token.bbox,
  }));
}

function tokensFromTesseract(data: { text?: string; words?: TesseractWord[]; tsv?: string }): OcrToken[] {
  if (data.tsv) {
    const tsvTokens = tokensFromTsv(data.tsv);
    if (tsvTokens.length) return tsvTokens;
  }

  const words = data.words || [];
  if (!words.length) {
    return [];
  }

  return words
    .filter(word => word.text?.trim())
    .map((word, index) => ({
      text: word.text?.trim() || '',
      clean: normalizeWord(word.text || ''),
      lineIndex: word.line?.id ?? Math.floor(index / 8),
      tokenIndex: index,
      line: word.line?.text || '',
      confidence: Number.isFinite(word.confidence) ? word.confidence || 0 : 65,
      bbox: word.bbox
        ? {
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0,
          }
        : null,
    }));
}

function mimeTypeFromUri(uri: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.png')) return 'image/png';
  if (lowerUri.endsWith('.webp')) return 'image/webp';
  if (lowerUri.endsWith('.heic') || lowerUri.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

async function prepareNativeImageForOcr(asset: ImagePicker.ImagePickerAsset): Promise<OcrImageInput> {
  const maxSide = Math.max(asset.width || 0, asset.height || 0);
  const resizeAction = maxSide > 2200
    ? [{
        resize: asset.width >= asset.height
          ? { width: 2200 }
          : { height: 2200 },
      }]
    : [];

  const normalized = await ImageManipulator.manipulateAsync(asset.uri, resizeAction, {
    base64: true,
    compress: 0.86,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!normalized.base64) {
    throw new Error('Failed to prepare image for OCR.');
  }

  return {
    uri: normalized.uri,
    base64: normalized.base64,
    mimeType: 'image/jpeg',
  };
}

function errorMessageText(message?: string | string[]): string {
  if (Array.isArray(message)) return message.join(' / ');
  return message || 'OCR APIに失敗しました。';
}

function tokensFromOcrSpace(data: OcrSpaceResponse): OcrToken[] {
  const tokens: OcrToken[] = [];
  const lines = (data.ParsedResults || [])
    .flatMap(result => result.TextOverlay?.Lines || []);

  lines.forEach((line, lineIndex) => {
    const lineText = line.LineText || line.Words?.map(word => word.WordText || '').join(' ') || '';
    (line.Words || []).forEach((word, tokenIndex) => {
      const text = word.WordText?.trim() || '';
      if (!text) return;
      tokens.push({
        text,
        clean: normalizeWord(text),
        lineIndex,
        tokenIndex,
        line: lineText,
        confidence: 72,
        bbox: {
          x: word.Left || 0,
          y: word.Top || 0,
          width: word.Width || 0,
          height: word.Height || 0,
        },
      });
    });
  });

  return tokens;
}

async function recognizeWithOcrSpace(input: OcrImageInput): Promise<OcrSpaceResponse> {
  const base64 = input.base64 || await new File(input.uri).base64();
  const formData = new FormData();
  formData.append('apikey', OCR_SPACE_API_KEY);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');
  formData.append('base64Image', `data:${input.mimeType || mimeTypeFromUri(input.uri)};base64,${base64}`);

  const response = await fetch(OCR_SPACE_ENDPOINT, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`OCR API request failed: ${response.status}`);
  }

  const data = await response.json() as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    throw new Error(errorMessageText(data.ErrorMessage));
  }
  return data;
}

function cleanTranslation(text?: string): string {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if (!value || value.toLowerCase() === 'null') return '';
  return value.slice(0, 80);
}

async function translateTermToJapanese(term: string): Promise<string> {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return '';
  const cached = translationCache.get(normalized);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    q: term,
    langpair: 'en|ja',
  });
  if (MYMEMORY_EMAIL) {
    params.set('de', MYMEMORY_EMAIL);
  }

  const response = await fetch(`${MYMEMORY_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translation API request failed: ${response.status}`);
  }

  const data = await response.json() as MyMemoryResponse;
  if (data.responseStatus && data.responseStatus >= 400) {
    throw new Error(data.responseDetails || 'Translation API failed.');
  }

  const translated = cleanTranslation(data.responseData?.translatedText);
  translationCache.set(normalized, translated);
  return translated;
}

async function translateExtractedTerms(
  items: ExtractedTerm[],
  onProgress?: (translatedCount: number, totalCount: number) => void,
): Promise<ExtractedTerm[]> {
  const uniqueTerms = [...new Set(items.map(item => item.term.trim()).filter(Boolean))];
  const translations = new Map<string, string>();

  for (const [index, term] of uniqueTerms.entries()) {
    try {
      translations.set(term, await translateTermToJapanese(term));
    } catch (error) {
      console.warn('Failed to translate term', term, error);
      translations.set(term, '');
    }
    onProgress?.(index + 1, uniqueTerms.length);
  }

  return items.map(item => ({
    ...item,
    meaning: translations.get(item.term.trim()) || '',
    needsReview: item.needsReview || !translations.get(item.term.trim()),
  }));
}

export default function ImportImageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folderPath?: string }>();
  const colors = useColors();
  const { t } = useLanguage();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [imageUri, setImageUri] = useState('');
  const [results, setResults] = useState<ExtractedTerm[]>([]);
  const [sortOrder, setSortOrder] = useState<'confidence' | 'detection'>('confidence');
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [extractionTarget, setExtractionTarget] = useState<ExtractionTarget>('word');
  const [isRunning, setIsRunning] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [ocrImageInput, setOcrImageInput] = useState<OcrImageInput | null>(null);
  const [status, setStatus] = useState(t('statusSelectImage'));

  const folderPath = useMemo(() => {
    try {
      return params.folderPath ? JSON.parse(params.folderPath as string) as string[] : [];
    } catch {
      return [];
    }
  }, [params.folderPath]);

  const selectedCount = selectedTerms.size;
  const hasResults = results.length > 0;

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (sortOrder === 'detection') {
        const orderA = a.detectionIndex ?? 0;
        const orderB = b.detectionIndex ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return b.confidence - a.confidence;
      }
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (a.detectionIndex ?? 0) - (b.detectionIndex ?? 0);
    });
  }, [results, sortOrder]);
  const imagePreviewHeight = Math.round(Math.min(
    Math.max(windowHeight * 0.58, 360),
    windowWidth < 700 ? 560 : 640,
  ));
  const extractionTargetLabel = extractionTarget === 'word' ? t('word') : t('phrase');

  const setAllSelected = (items: ExtractedTerm[]) => {
    setSelectedTerms(new Set(items.map(item => `${item.type}:${item.term}`)));
  };

  const filterByExtractionTarget = (items: ExtractedTerm[]) => (
    items.filter(item => item.type === extractionTarget)
  );

  const changeExtractionTarget = (target: ExtractionTarget) => {
    setExtractionTarget(target);
    setResults([]);
    setSelectedTerms(new Set());
    setStatus(target === 'word'
      ? t('statusSelectWord')
      : t('statusSelectPhrase'));
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(t('accessPermissionRequiredTitle'), t('photoPermissionRequired'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      base64: Platform.OS !== 'web',
      quality: 1,
      mediaTypes: ['images'],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setOcrImageInput(null);
    setResults([]);
    setSelectedTerms(new Set());

    if (Platform.OS !== 'web') {
      setIsPreparingImage(true);
      try {
        setStatus(t('statusPreparingOcr'));
        const prepared = await prepareNativeImageForOcr(asset);
        setOcrImageInput(prepared);
        setStatus(t('statusSelectedImage'));
      } catch (error) {
        setOcrImageInput({
          uri: asset.uri,
          base64: asset.base64 || undefined,
          mimeType: asset.mimeType || mimeTypeFromUri(asset.uri),
        });
        setStatus(t('statusSkippedImageTransform', { error: error instanceof Error ? error.message : String(error) }));
      } finally {
        setIsPreparingImage(false);
      }
      return;
    }

    setStatus(Platform.OS === 'web'
      ? '画像を選択しました。「単語候補を抽出」を押してください。'
      : '画像を選択しました。「単語候補を抽出」を押してください。');
  };

  const runOcr = async () => {
    if (!imageUri) {
      setStatus(t('statusSelectImageFirst'));
      return;
    }

    setIsRunning(true);
    try {
      if (Platform.OS !== 'web') {
        setStatus(t('statusSendingOcr'));
        const data = await recognizeWithOcrSpace(ocrImageInput || { uri: imageUri });
        const text = (data.ParsedResults || [])
          .map(result => result.ParsedText || '')
          .join('\n');
        const tokens = tokensFromOcrSpace(data);
        const extracted = filterByExtractionTarget(tokens.length ? extractTermsFromTokens(tokens) : extractTermsFromText(text));
        setResults(extracted);
        setAllSelected(extracted.filter(item => item.confidence >= 55));
        setStatus(t('statusFoundCandidates', { count: extracted.length, target: extractionTargetLabel }));
        return;
      }

      setStatus(t('statusPreparingOcrEngine'));
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker(OCR_LANGUAGES, undefined, {
        logger: message => {
          if (message.status) {
            const progress = Number.isFinite(message.progress)
              ? ` ${Math.round((message.progress || 0) * 100)}%`
              : '';
            setStatus(`${message.status}${progress}`);
          }
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        user_defined_dpi: '300',
      });

      const recognize = async (uri: string, label: string) => {
        setStatus(label === 'enhanced image'
          ? t('statusReadingImage')
          : t('statusCheckingOcrResult'));
        const response = await worker.recognize(uri, {}, { text: true, tsv: true, blocks: true });
        return response.data as TesseractData;
      };

      let data: TesseractData;
      try {
        setStatus(t('statusCorrectingImage'));
        const enhancedUri = await preprocessImageForOcr(imageUri);
        data = await recognize(enhancedUri, 'enhanced image');
        const enhancedConfidence = averageWordConfidence(data);
        const enhancedWordCount = recognizedWordCount(data);

        if (enhancedConfidence < MIN_RETRY_CONFIDENCE || enhancedWordCount < 4) {
          const originalData = await recognize(imageUri, 'original image');
          const originalConfidence = averageWordConfidence(originalData);
          const originalWordCount = recognizedWordCount(originalData);
          if (originalConfidence + originalWordCount * 0.4 > enhancedConfidence + enhancedWordCount * 0.4) {
            data = originalData;
          }
        }
      } finally {
        await worker.terminate();
      }

      const tokens = tokensFromTesseract(data);
      const extracted = filterByExtractionTarget(tokens.length ? extractTermsFromTokens(tokens) : extractTermsFromText(data.text || ''));
      setResults(extracted);
      setAllSelected(extracted.filter(item => item.confidence >= 55));
      setStatus(t('statusFoundCandidates', { count: extracted.length, target: extractionTargetLabel }));
    } catch (error) {
      setStatus(t('statusOcrFailed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setIsRunning(false);
    }
  };

  const toggleTerm = (item: ExtractedTerm) => {
    const key = `${item.type}:${item.term}`;
    setSelectedTerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const translateSelected = async () => {
    const selectedItems = results.filter(item => selectedTerms.has(`${item.type}:${item.term}`));
    if (!selectedItems.length) {
      setStatus(t('statusSelectCandidatesFirst'));
      return;
    }

    setIsTranslating(true);
    try {
      setStatus(t('statusTranslatingSelected', { count: selectedItems.length }));
      const translated = await translateExtractedTerms(selectedItems, (done, total) => {
        setStatus(t('statusTranslatingProgress', { done, total }));
      });
      const translatedByKey = new Map(translated.map(item => [`${item.type}:${item.term}`, item]));
      setResults(prev => prev.map(item => translatedByKey.get(`${item.type}:${item.term}`) || item));
      setStatus(t('statusGeneratedTranslations', { count: translated.length }));
    } catch (error) {
      setStatus(t('statusTranslationFailed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setIsTranslating(false);
    }
  };

  const saveSelected = () => {
    if (folderPath.length === 0) {
      Alert.alert(t('saveDestinationRequiredTitle'), t('saveDestinationRequiredMsg'));
      return;
    }

    const now = new Date().toISOString();
    const cards: Card[] = results
      .filter(item => selectedTerms.has(`${item.type}:${item.term}`))
      .map(item => ({
        uuid: generateUUID(),
        front: item.term,
        back: item.meaning || '',
        memo: '',
        createdAt: now,
        lastEdited: now,
        nextTestTime: NaN,
        memorizationLevel: 0,
        objRememberTime: 0,
      }));

    if (!cards.length) {
      setStatus(t('selectOneOrMoreCandidates'));
      return;
    }

    const ok = cards.every(card => addCard(folderPath, card));
    if (ok) {
      router.back();
    } else {
      setStatus(t('saveCardFailed'));
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      gap: 14,
    },
    header: {
      backgroundColor: colors.element,
      borderBottomColor: colors.divider,
      borderBottomWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...shadow,
    },
    title: {
      color: colors.titleText,
      fontSize: 18,
      fontWeight: boldWeight,
    },
    status: {
      color: colors.plainText,
      fontSize: 13,
      lineHeight: 18,
    },
    panelTitle: {
      color: colors.titleText,
      fontSize: 17,
      fontWeight: boldWeight,
    },
    panel: {
      backgroundColor: colors.element,
      borderRadius: 8,
      padding: 12,
      gap: 10,
      ...shadow,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    targetSelector: {
      borderColor: colors.divider,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    targetOption: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    targetOptionSelected: {
      backgroundColor: colors.accentColor,
    },
    targetOptionText: {
      color: colors.plainText,
      fontSize: 14,
      fontWeight: boldWeight,
    },
    targetOptionTextSelected: {
      color: colors.titleText,
    },
    button: {
      minHeight: 42,
      borderRadius: 8,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.lessAccentColor,
      flexDirection: 'row',
      gap: 6,
    },
    wideButton: {
      flex: 1,
      minWidth: 190,
    },
    mutedButton: {
      backgroundColor: colors.divider,
    },
    saveButton: {
      backgroundColor: colors.accentColor,
    },
    buttonText: {
      color: 'white',
      fontWeight: boldWeight,
      fontSize: 14,
    },
    mutedButtonText: {
      color: colors.titleText,
    },
    saveButtonText: {
      color: colors.titleText,
    },
    image: {
      width: '100%',
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    emptyState: {
      borderColor: colors.divider,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
    },
    emptyTitle: {
      color: colors.titleText,
      fontWeight: boldWeight,
      fontSize: 15,
      textAlign: 'center',
    },
    candidate: {
      borderColor: colors.divider,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 6,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    candidateSelected: {
      borderColor: colors.accentColor,
      backgroundColor: colors.elementHover,
    },
    candidateTitle: {
      color: colors.titleText,
      fontSize: 18,
      fontWeight: boldWeight,
    },
    candidateCheck: {
      width: 30,
      paddingTop: 2,
      alignItems: 'center',
    },
    candidateBody: {
      flex: 1,
      gap: 5,
    },
    candidateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    tag: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.background,
      color: colors.plainText,
      fontSize: 12,
      fontWeight: boldWeight,
      overflow: 'hidden',
    },
    candidateSub: {
      color: colors.plainText,
      fontSize: 13,
      lineHeight: 18,
    },
    score: {
      color: colors.accentColor,
      fontWeight: boldWeight,
    },
    sortToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8,
    },
    sortToggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 5,
    },
    sortToggleButtonActive: {
      backgroundColor: colors.accentColor + '20',
      borderColor: colors.accentColor,
    },
    sortToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.plainText,
    },
    sortToggleTextActive: {
      color: colors.titleText,
      fontWeight: boldWeight,
    },
    footerActions: {
      gap: 10,
    },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TabBar />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={colors.plainText} />
          </Pressable>
          <Text style={styles.title}>{t('importImageTitle')}</Text>
          <Pressable onPress={saveSelected}>
            <Ionicons name="save-outline" size={28} color={colors.plainText} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{t('step1ReadImage')}</Text>
            <Text style={styles.status}>{status}</Text>
            <Text style={styles.status}>
              {t('saveDestinationPrefix')}{folderPath.length ? folderPath.join(' > ') : t('unselected')}
            </Text>
            <View style={styles.targetSelector}>
              {(['word', 'phrase'] as ExtractionTarget[]).map(target => {
                const selected = extractionTarget === target;
                return (
                  <Pressable
                    key={target}
                    onPress={() => changeExtractionTarget(target)}
                    disabled={isRunning || isTranslating}
                    style={[styles.targetOption, selected && styles.targetOptionSelected]}
                  >
                    <Text style={[styles.targetOptionText, selected && styles.targetOptionTextSelected]}>
                      {target === 'word' ? t('word') : t('phrase')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.button, styles.wideButton]} onPress={pickImage} disabled={isRunning || isPreparingImage || isTranslating}>
                <Ionicons name="image-outline" size={18} color="white" />
                <Text style={styles.buttonText}>{t('selectImage')}</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.mutedButton, styles.wideButton]} onPress={runOcr} disabled={isRunning || isPreparingImage || isTranslating}>
                {isRunning || isPreparingImage
                  ? <ActivityIndicator size="small" color={colors.titleText} />
                  : <Ionicons name="scan-outline" size={18} color={colors.titleText} />}
                <Text style={[styles.buttonText, styles.mutedButtonText]}>
                  {t('extractCandidatesButton', { target: extractionTargetLabel })}
                </Text>
              </Pressable>
            </View>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={[styles.image, { height: imagePreviewHeight }]}
                resizeMode="contain"
              />
            ) : null}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{t('step2SelectCandidates')}</Text>
            {hasResults ? (
              <>
                <View style={styles.sortToggleRow}>
                  <Pressable
                    style={[
                      styles.sortToggleButton,
                      sortOrder === 'confidence' && styles.sortToggleButtonActive,
                    ]}
                    onPress={() => setSortOrder('confidence')}
                  >
                    <Ionicons
                      name="stats-chart-outline"
                      size={14}
                      color={sortOrder === 'confidence' ? colors.accentColor : colors.plainText}
                    />
                    <Text
                      style={[
                        styles.sortToggleText,
                        sortOrder === 'confidence' && styles.sortToggleTextActive,
                      ]}
                    >
                      {t('sortByConfidence')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sortToggleButton,
                      sortOrder === 'detection' && styles.sortToggleButtonActive,
                    ]}
                    onPress={() => setSortOrder('detection')}
                  >
                    <Ionicons
                      name="list-outline"
                      size={14}
                      color={sortOrder === 'detection' ? colors.accentColor : colors.plainText}
                    />
                    <Text
                      style={[
                        styles.sortToggleText,
                        sortOrder === 'detection' && styles.sortToggleTextActive,
                      ]}
                    >
                      {t('sortByDetection')}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.button, styles.mutedButton]}
                  onPress={translateSelected}
                  disabled={isRunning || isPreparingImage || isTranslating || selectedCount === 0}
                >
                  {isTranslating
                    ? <ActivityIndicator size="small" color={colors.titleText} />
                    : <Ionicons name="language-outline" size={18} color={colors.titleText} />}
                  <Text style={[styles.buttonText, styles.mutedButtonText]}>
                    {t('translate')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="sparkles-outline" size={28} color={colors.plainText} />
                <Text style={styles.emptyTitle}>{t('noCandidatesFound')}</Text>
              </View>
            )}
            {sortedResults.map(item => {
              const key = `${item.type}:${item.term}`;
              const selected = selectedTerms.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => toggleTerm(item)}
                  style={[styles.candidate, selected && styles.candidateSelected]}
                >
                  <View style={styles.candidateCheck}>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={selected ? colors.accentColor : colors.plainText}
                    />
                  </View>
                  <View style={styles.candidateBody}>
                    <View style={styles.candidateHeader}>
                      <Text style={styles.candidateTitle}>{item.term}</Text>
                      <Text style={styles.tag}>{item.type === 'phrase' ? t('phrase') : t('word')}</Text>
                    </View>
                    <Text style={styles.candidateSub}>
                      {t('confidence')} <Text style={styles.score}>{item.confidence}</Text>
                      {item.meaning ? ` / ${item.meaning}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.panel, styles.footerActions]}>
            <Text style={styles.panelTitle}>{t('step3CreateCards')}</Text>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={saveSelected}
              disabled={isRunning || isPreparingImage || isTranslating || selectedCount === 0}
            >
              <Ionicons name="albums-outline" size={18} color={colors.titleText} />
              <Text style={[styles.buttonText, styles.saveButtonText]}>
                {t('saveToFolderButton')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
