export type OcrBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrToken = {
  text: string;
  clean: string;
  lineIndex: number;
  tokenIndex: number;
  line: string;
  confidence: number;
  bbox?: OcrBox | null;
};

export type ExtractedTerm = {
  term: string;
  type: 'word' | 'phrase';
  confidence: number;
  meaning: string;
  sourceText: string;
  needsReview: boolean;
  reason: string[];
  detectionIndex?: number;
};

const commonWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'in',
  'is', 'it', 'its', 'of', 'on', 'or', 'our', 'she', 'should', 'student',
  'students', 'that', 'the', 'their', 'there', 'they', 'this', 'to',
  'understand', 'was', 'we', 'were', 'will', 'with', 'you', 'your',
]);

const highValueSuffixes = [
  'tion', 'sion', 'ment', 'ness', 'ity', 'ism', 'ist', 'ize', 'ise', 'ous',
  'ive', 'able', 'ible', 'ance', 'ence', 'ship', 'less', 'ful', 'ward',
  'graph', 'logy',
];

const domainHints = new Set([
  'climate', 'global', 'warming', 'energy', 'renewable', 'resource',
  'population', 'society', 'culture', 'communication', 'environment',
  'technology', 'information', 'research', 'experiment', 'hypothesis',
  'evidence', 'democracy', 'economy', 'ecosystem', 'sustainable',
  'biodiversity', 'emission', 'carbon', 'pollution', 'recycle', 'education',
  'identity', 'diversity', 'international', 'community', 'development',
  'innovation',
]);

const translationMap: Record<string, string> = {
  biodiversity: 'biological diversity',
  carbon: 'carbon',
  climate: 'climate',
  communication: 'communication',
  culture: 'culture',
  democracy: 'democracy',
  diversity: 'diversity',
  economy: 'economy',
  education: 'education',
  emission: 'emission',
  energy: 'energy',
  environment: 'environment',
  evidence: 'evidence',
  innovation: 'innovation',
  pollution: 'pollution',
  population: 'population',
  renewable: 'renewable',
  research: 'research',
  resource: 'resource',
  society: 'society',
  sustainable: 'sustainable',
  technology: 'technology',
};

const ocrWordCorrections: Record<string, string> = {
  ap: 'up',
  acrogg: 'across',
  builty: 'guilty',
  fun: 'run',
  lain: 'plain',
  reak: 'break',
  tp: 'up',
  unfam: 'unfamiliar',
};

const phrasalParticles = new Set([
  'up',
  'down',
  'back',
  'on',
  'off',
  'out',
  'in',
  'over',
  'away',
  'at',
  'with',
  'for',
  'about',
  'across',
]);

const headingNoise = new Set([
  'jliar',
  'mkiml',
]);

function repairOcrGlyphs(word: string): string {
  const chars = word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’`´]/g, "'")
    .replace(/[|]/g, 'l')
    .split('');
  return chars.map((char, index) => {
    const previous = chars[index - 1] || '';
    const next = chars[index + 1] || '';
    const betweenLetters = /[A-Za-z]/.test(previous) && /[A-Za-z]/.test(next);
    if (!betweenLetters) return char;
    if (char === '0') return 'o';
    if (char === '1' || char === '!') return 'l';
    if (char === '3') return 'e';
    if (char === '5') return 's';
    if (char === '6') return 'g';
    if (char === '8') return 'b';
    return char;
  }).join('');
}

export function normalizeWord(word: string): string {
  let value = repairOcrGlyphs(word).toLowerCase().replace(/^[^a-z]+|[^a-z'-]+$/g, '');
  value = value.replace(/[’`]/g, "'");
  if (value.length > 5 && value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else if (value.length > 5 && value.endsWith('ing')) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith('ed')) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith('es')) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith('s')) value = value.slice(0, -1);
  value = ocrWordCorrections[value] || value;
  return value;
}

function normalizePhraseWord(word: string): string {
  return repairOcrGlyphs(word)
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z'-]+$/g, '')
    .replace(/[窶兪]/g, "'");
}

export function isEnglishToken(text: string): boolean {
  return /^[^A-Za-z]*[A-Za-z][A-Za-z'-]{1,}[,.;:)]*$/.test(repairOcrGlyphs(text));
}

function containsJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function cleanMeaningText(text: string): string {
  return text
    .replace(/[\u25a0-\u25ff\u25b2-\u25bc\u25c6-\u25c7]/g, '')
    .replace(/[\u2460-\u2473]/g, '')
    .replace(/\s+/g, '')
    .replace(/^[;:\u3001\u3002\u30fb\s]+|[;:\u3001\u3002\u30fb\s]+$/g, '')
    .slice(0, 48);
}

function isMeaningNoiseToken(text: string): boolean {
  return /^[\u540d\u5f62\u526f\u52d5\u767a\u540c\u53cd\u53c2]$/.test(text.trim());
}

function centerY(box: OcrBox): number {
  return box.y + box.height / 2;
}

function unionBox(boxes: OcrBox[]): OcrBox {
  const left = Math.min(...boxes.map(box => box.x));
  const top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function splitTokensFromText(text: string): OcrToken[] {
  const lines = text
    .replace(/-\n(?=[A-Za-z])/g, '')
    .split(/\n+/)
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(item => item.line.trim());

  const tokens: OcrToken[] = [];
  lines.forEach(({ line, lineIndex }) => {
    const parts = line.match(/[A-Za-z][A-Za-z'-]*|[\u3040-\u30ff\u3400-\u9fff]+|[0-9]+|[^\s]/g) || [];
    parts.forEach((part, index) => {
      tokens.push({
        text: part,
        clean: normalizeWord(part),
        lineIndex,
        tokenIndex: index,
        line,
        confidence: 72,
        bbox: null,
      });
    });
  });
  return tokens;
}

function nearbyJapaneseMeaning(tokens: OcrToken[], targetIndexes: number[]): string {
  const indexes = new Set(targetIndexes);
  const targetBoxes = targetIndexes.map(index => tokens[index]?.bbox).filter(Boolean) as OcrBox[];
  if (targetBoxes.length) {
    const targetBox = unionBox(targetBoxes);
    const averageHeight = targetBoxes.reduce((sum, box) => sum + box.height, 0) / targetBoxes.length;
    const rightEdge = pageRight(tokens);
    const targetRight = targetBox.x + targetBox.width;
    const rowJapanese = tokens
      .filter((token, index) => !indexes.has(index) && containsJapanese(token.text) && !isMeaningNoiseToken(token.text))
      .filter((token): token is OcrToken & { bbox: OcrBox } => Boolean(token.bbox))
      .map(token => {
        const yDistance = Math.abs(centerY(token.bbox) - centerY(targetBox));
        const startsToRight = token.bbox.x >= targetRight - averageHeight * 0.4;
        const likelyMeaningColumn = rightEdge ? token.bbox.x >= rightEdge * 0.36 : startsToRight;
        const rowAligned = yDistance <= Math.max(averageHeight * 1.45, token.bbox.height * 1.8);
        return {
          token,
          score:
            (rowAligned ? 80 : 0)
            + (startsToRight ? 20 : 0)
            + (likelyMeaningColumn ? 14 : 0)
            - yDistance * 0.35
            - Math.max(0, targetRight - token.bbox.x) * 0.08,
        };
      })
      .filter(item => item.score >= 55)
      .sort((a, b) => {
        const ay = Math.abs(centerY(a.token.bbox) - centerY(targetBox));
        const by = Math.abs(centerY(b.token.bbox) - centerY(targetBox));
        if (Math.abs(ay - by) > averageHeight * 0.35) return ay - by;
        return a.token.bbox.x - b.token.bbox.x;
      })
      .slice(0, 8)
      .map(item => item.token.text);

    const visualMeaning = cleanMeaningText(rowJapanese.join(''));
    if (visualMeaning) return visualMeaning;
  }

  const targetLines = targetIndexes
    .map(index => tokens[index]?.lineIndex)
    .filter(Number.isFinite);
  const minLine = Math.min(...targetLines);
  const maxLine = Math.max(...targetLines);
  const targetPositions = targetIndexes
    .map(index => tokens[index]?.tokenIndex)
    .filter(Number.isFinite);
  const minPosition = Math.min(...targetPositions);
  const maxPosition = Math.max(...targetPositions);

  const sameLine = tokens
    .filter((token, index) => !indexes.has(index) && containsJapanese(token.text) && !isMeaningNoiseToken(token.text))
    .filter(token => token.lineIndex >= minLine && token.lineIndex <= maxLine)
    .sort((a, b) => {
      const aDistance = Math.min(Math.abs(a.tokenIndex - minPosition), Math.abs(a.tokenIndex - maxPosition));
      const bDistance = Math.min(Math.abs(b.tokenIndex - minPosition), Math.abs(b.tokenIndex - maxPosition));
      return aDistance - bDistance;
    })
    .slice(0, 5)
    .map(token => token.text)
    .join('');

  if (sameLine) return cleanMeaningText(sameLine);
  if (!targetBoxes.length) return '';

  const top = Math.min(...targetBoxes.map(box => box.y));
  const bottom = Math.max(...targetBoxes.map(box => box.y + box.height));
  const averageHeight = targetBoxes.reduce((sum, box) => sum + box.height, 0) / targetBoxes.length;
  const visualFallback = tokens
    .filter((token, index) => !indexes.has(index) && containsJapanese(token.text) && !isMeaningNoiseToken(token.text))
    .filter((token): token is OcrToken & { bbox: OcrBox } => Boolean(token.bbox))
    .filter(token => {
      const centerY = token.bbox.y + token.bbox.height / 2;
      return centerY >= top - averageHeight * 0.8 && centerY <= bottom + averageHeight * 1.4;
    })
    .slice(0, 4)
    .map(token => token.text)
    .join('');
  return cleanMeaningText(visualFallback);
}

function visualWeight(token: OcrToken): number {
  if (!token.bbox) return 0;
  let score = 0;
  if (token.bbox.height >= 24) score += 8;
  if (token.bbox.width / Math.max(1, token.text.length) >= 13) score += 5;
  if (token.bbox.x < 80) score += 4;
  return score;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pageRight(tokens: OcrToken[]): number {
  const rights = tokens
    .map(token => token.bbox ? token.bbox.x + token.bbox.width : 0)
    .filter(value => value > 0);
  return rights.length ? Math.max(...rights) : 0;
}

function headingWeight(token: OcrToken, tokens: OcrToken[]): { score: number; isHeading: boolean } {
  if (!token.bbox || !/^[a-z'-]{3,}$/.test(token.clean)) {
    return { score: 0, isHeading: false };
  }
  if ((token.confidence || 0) < 65) {
    return { score: 0, isHeading: false };
  }

  const right = pageRight(tokens);
  const englishBoxes = tokens
    .filter(item => item.bbox && isEnglishToken(item.text))
    .map(item => item.bbox as OcrBox);
  if (!englishBoxes.length) return { score: 0, isHeading: false };
  const medianHeight = median(englishBoxes.map(box => box.height));
  const minLeft = Math.min(...englishBoxes.map(box => box.x));
  const leftLimit = right ? Math.max(minLeft + right * 0.18, right * 0.34) : minLeft + 260;
  const pageTextLeft = right ? Math.max(minLeft, right * 0.12) : minLeft;
  const wideLetters = token.bbox.width / Math.max(1, token.clean.length) >= 24;
  const largeText = token.bbox.height >= Math.max(38, medianHeight * 1.15) || wideLetters;
  const leftColumn = token.bbox.x <= leftLimit && token.bbox.x >= pageTextLeft;
  const wordLike = token.clean.length >= 3
    && !commonWords.has(token.clean)
    && !headingNoise.has(token.clean)
    && !phrasalParticles.has(token.clean);

  if (!largeText || !leftColumn || !wordLike) {
    return { score: 0, isHeading: false };
  }

  return { score: 36, isHeading: true };
}

function headingVisualWeight(token: OcrToken, tokens: OcrToken[]): { score: number; isHeading: boolean } {
  if (!token.bbox || !/^[a-z'-]{2,}$/.test(token.clean)) {
    return { score: 0, isHeading: false };
  }
  if ((token.confidence || 0) < 45 || (commonWords.has(token.clean) && !phrasalParticles.has(token.clean)) || headingNoise.has(token.clean)) {
    return { score: 0, isHeading: false };
  }

  const right = pageRight(tokens);
  const englishBoxes = tokens
    .filter(item => item.bbox && isEnglishToken(item.text))
    .map(item => item.bbox as OcrBox);
  if (!englishBoxes.length) return { score: 0, isHeading: false };

  const medianHeight = median(englishBoxes.map(box => box.height));
  const minLeft = Math.min(...englishBoxes.map(box => box.x));
  const leftLimit = right ? Math.max(minLeft + right * 0.2, right * 0.38) : minLeft + 320;
  const pageTextLeft = right ? Math.max(minLeft, right * 0.12) : minLeft;
  const wideLetters = token.bbox.width / Math.max(1, token.clean.length) >= 22;
  const largeText = token.bbox.height >= Math.max(32, medianHeight * 0.85) || wideLetters;
  const leftColumn = token.bbox.x <= leftLimit && token.bbox.x >= pageTextLeft;

  if (!largeText || !leftColumn) {
    return { score: 0, isHeading: false };
  }

  return { score: 34, isHeading: true };
}

function scoreWord(token: OcrToken, occurrences: number, tokens: OcrToken[]) {
  const reasons: string[] = [];
  let score = Math.max(0, Math.min(100, token.confidence || 60)) * 0.45;
  const clean = token.clean;

  if (clean.length >= 6) {
    score += 12;
    reasons.push('long word');
  }
  if (highValueSuffixes.some(suffix => clean.endsWith(suffix))) {
    score += 12;
    reasons.push('academic suffix');
  }
  if (domainHints.has(clean)) {
    score += 16;
    reasons.push('topic word');
  }
  if (translationMap[clean]) {
    score += 8;
    reasons.push('dictionary hit');
  }
  if (occurrences > 1) {
    score += Math.min(12, occurrences * 4);
    reasons.push('repeated');
  }
  if (commonWords.has(clean)) {
    score -= 35;
    reasons.push('basic word');
  }
  if (!/^[a-z'-]+$/.test(clean) || clean.length < 2) {
    score -= 45;
    reasons.push('ocr noise');
  }

  score += visualWeight(token);
  const heading = headingWeight(token, tokens);
  if (heading.isHeading) {
    score += heading.score;
    reasons.push('heading word');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

function phraseScore(tokens: OcrToken[], indexes: number[]) {
  const phrase = indexes.map(index => normalizePhraseWord(tokens[index].text)).join(' ');
  const reasons = ['english sequence'];
  let score = 48;
  const words = indexes.map(index => tokens[index].clean);
  const hasTinyNoise = words.some(word => word.length <= 2 && !commonWords.has(word));
  const hasHeadingWord = indexes.some(index => headingWeight(tokens[index], tokens).isHeading);
  const averageLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const hasDomain = words.some(word => domainHints.has(word));
  const hasSuffix = words.some(word => highValueSuffixes.some(suffix => word.endsWith(suffix)));
  const allCommon = words.every(word => commonWords.has(word));
  const averageConfidence = indexes.reduce((sum, index) => sum + (tokens[index].confidence || 60), 0) / indexes.length;

  score += averageConfidence * 0.25;
  if (averageLength >= 5) {
    score += 8;
    reasons.push('content words');
  }
  if (hasDomain) {
    score += 14;
    reasons.push('contains topic word');
  }
  if (hasSuffix) {
    score += 6;
    reasons.push('contains academic suffix');
  }
  if (allCommon) {
    score -= 38;
    reasons.push('basic words only');
  }
  if (words.length >= 3) {
    score += 5;
    reasons.push('multiword expression');
  }
  if (hasTinyNoise) {
    score -= 28;
    reasons.push('short ocr noise');
  }
  if (hasHeadingWord) {
    score -= 60;
    reasons.push('near heading');
  }

  return {
    term: phrase,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

function addHeadingPhrases(tokens: OcrToken[], byTerm: Map<string, ExtractedTerm>) {
  const lineIndexes = [...new Set(tokens.map(token => token.lineIndex))];
  lineIndexes.forEach(lineIndex => {
    const lineTokens = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.lineIndex === lineIndex)
      .filter(({ token }) => isEnglishToken(token.text) && token.clean && headingVisualWeight(token, tokens).isHeading)
      .sort((a, b) => {
        const ax = a.token.bbox?.x || 0;
        const bx = b.token.bbox?.x || 0;
        return ax - bx;
      });

    for (let start = 0; start < lineTokens.length - 1; start += 1) {
      const first = lineTokens[start];
      const second = lineTokens[start + 1];
      if (!first.token.bbox || !second.token.bbox) continue;
      const gap = second.token.bbox.x - (first.token.bbox.x + first.token.bbox.width);
      const aligned = Math.abs(first.token.bbox.y - second.token.bbox.y) <= Math.max(first.token.bbox.height, second.token.bbox.height) * 0.7;
      const plausiblePair = !phrasalParticles.has(first.token.clean) && phrasalParticles.has(second.token.clean);
      if (gap < -8 || gap > Math.max(95, first.token.bbox.height * 2.2) || !aligned || !plausiblePair) continue;

      const indexes = [first.index, second.index];
      const term = indexes.map(index => tokens[index].clean).join(' ');
      const meaning = nearbyJapaneseMeaning(tokens, indexes);
      const confidence = Math.max(0, Math.min(100, Math.round(
        indexes.reduce((sum, index) => sum + (tokens[index].confidence || 60), 0) / indexes.length + 8,
      )));
      const item: ExtractedTerm = {
        term,
        type: 'phrase',
        confidence,
        meaning,
        sourceText: first.token.line || term,
        needsReview: confidence < 72 || !meaning,
        reason: ['heading phrase'],
        detectionIndex: first.index,
      };
      const key = `phrase:${term}`;
      const existing = byTerm.get(key);
      if (!existing) {
        byTerm.set(key, item);
      } else if (item.confidence > existing.confidence) {
        item.detectionIndex = existing.detectionIndex ?? item.detectionIndex;
        byTerm.set(key, item);
      }
    }
  });
}

export function extractTermsFromTokens(tokens: OcrToken[]): ExtractedTerm[] {
  const englishIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => isEnglishToken(token.text) && token.clean);

  const counts = new Map<string, number>();
  englishIndexes.forEach(({ token }) => {
    counts.set(token.clean, (counts.get(token.clean) || 0) + 1);
  });

  const byTerm = new Map<string, ExtractedTerm>();
  addHeadingPhrases(tokens, byTerm);
  englishIndexes.forEach(({ token, index }) => {
    const { score, reasons } = scoreWord(token, counts.get(token.clean) || 1, tokens);
    if (score < 25) return;

    const meaning = nearbyJapaneseMeaning(tokens, [index]) || translationMap[token.clean] || '';
    const item: ExtractedTerm = {
      term: token.clean,
      type: 'word',
      confidence: score,
      meaning,
      sourceText: token.line || token.text,
      needsReview: score < 68 || !meaning,
      reason: [...new Set(reasons)],
      detectionIndex: index,
    };
    const existing = byTerm.get(token.clean);
    const itemIsHeading = item.reason.includes('heading word');
    const existingIsHeading = existing?.reason.includes('heading word') || false;
    if (!existing) {
      byTerm.set(token.clean, item);
    } else if ((itemIsHeading && !existingIsHeading) || item.confidence > existing.confidence) {
      item.detectionIndex = existing.detectionIndex ?? item.detectionIndex;
      byTerm.set(token.clean, item);
    }
  });

  const runs: number[][] = [];
  let current: number[] = [];
  let currentLine = -1;
  tokens.forEach((token, index) => {
    const sameLine = currentLine === token.lineIndex;
    if (isEnglishToken(token.text) && token.clean && !commonWords.has(token.clean) && (current.length === 0 || sameLine)) {
      current.push(index);
      currentLine = token.lineIndex;
    } else {
      if (current.length >= 2) runs.push(current);
      current = [];
      currentLine = -1;
      if (isEnglishToken(token.text) && token.clean && !commonWords.has(token.clean)) {
        current.push(index);
        currentLine = token.lineIndex;
      }
    }
  });
  if (current.length >= 2) runs.push(current);

  runs.forEach(run => {
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let start = 0; start <= run.length - size; start += 1) {
        const indexes = run.slice(start, start + size);
        const { term, score, reasons } = phraseScore(tokens, indexes);
        if (score < 62) continue;

        const meaning = nearbyJapaneseMeaning(tokens, indexes);
        const item: ExtractedTerm = {
          term,
          type: 'phrase',
          confidence: score,
          meaning,
          sourceText: tokens[indexes[0]].line || indexes.map(index => tokens[index].text).join(' '),
          needsReview: score < 72 || !meaning,
          reason: [...new Set(reasons)],
          detectionIndex: indexes[0],
        };
        const key = `phrase:${term}`;
        const existing = byTerm.get(key);
        if (!existing) {
          byTerm.set(key, item);
        } else if (item.confidence > existing.confidence) {
          item.detectionIndex = existing.detectionIndex ?? item.detectionIndex;
          byTerm.set(key, item);
        }
      }
    }
  });

  const headingPhraseWords = new Set(
    [...byTerm.values()]
      .filter(item => item.type === 'phrase' && item.reason.includes('heading phrase'))
      .flatMap(item => item.term.split(' ')),
  );

  return [...byTerm.values()]
    .filter(item => !(item.type === 'word' && item.reason.includes('heading word') && headingPhraseWords.has(item.term)))
    .sort((a, b) => b.confidence - a.confidence || a.term.localeCompare(b.term))
    .slice(0, 80);
}

export function extractTermsFromText(text: string): ExtractedTerm[] {
  return extractTermsFromTokens(splitTokensFromText(text));
}
