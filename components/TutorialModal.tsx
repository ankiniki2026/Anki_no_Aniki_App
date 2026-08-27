import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { boldWeight, shadow, useColors } from '../app/lib/colors';
import { useTutorial, TUTORIAL_STEPS } from '../app/lib/tutorialContext';

export function TutorialModal() {
  const colors = useColors();
  const {
    isTutorialOpen,
    currentStepIndex,
    closeTutorial,
    nextStep,
    prevStep,
  } = useTutorial();

  if (!isTutorialOpen) return null;

  const currentStep = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TUTORIAL_STEPS.length - 1;
  const progressPercent = ((currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100;

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: Platform.OS === 'ios' ? 30 : 20,
      paddingHorizontal: 16,
    },
    container: {
      width: '100%',
      maxWidth: 520,
      backgroundColor: colors.element,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    progressBarBg: {
      height: 4,
      width: '100%',
      backgroundColor: colors.divider + '40',
    },
    progressBarFill: {
      height: '100%',
      width: `${progressPercent}%`,
      backgroundColor: colors.accentColor,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 8,
    },
    badgeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    stepBadge: {
      backgroundColor: colors.accentColor + '25',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentColor + '50',
    },
    stepBadgeText: {
      fontSize: 12,
      fontWeight: boldWeight,
      color: colors.accentColor,
    },
    routeBadge: {
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.3)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    routeBadgeText: {
      fontSize: 12,
      fontWeight: boldWeight,
      color: '#007AFF',
    },
    closeButton: {
      padding: 4,
      borderRadius: 16,
    },
    contentArea: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      maxHeight: 220,
    },
    stepTitle: {
      fontSize: 17,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 8,
    },
    stepText: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.plainText,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.divider + '60',
      backgroundColor: colors.element,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    navButton: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navButtonDisabled: {
      opacity: 0.4,
    },
    navButtonText: {
      fontSize: 14,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    nextButton: {
      backgroundColor: colors.accentColor,
      borderColor: colors.accentColor,
      paddingHorizontal: 22,
    },
    nextButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: boldWeight,
    },
  });

  return (
    <Modal
      visible={isTutorialOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={closeTutorial}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={styles.progressBarFill} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeContainer}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  ステップ {currentStep.stepNumber} / {TUTORIAL_STEPS.length}
                </Text>
              </View>
              {currentStep.badge ? (
                <View style={styles.routeBadge}>
                  <Ionicons name="navigate-outline" size={12} color="#007AFF" />
                  <Text style={styles.routeBadgeText}>{currentStep.badge}</Text>
                </View>
              ) : null}
            </View>

            <Pressable onPress={closeTutorial} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.plainText} />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView style={styles.contentArea} showsVerticalScrollIndicator={true}>
            <Text style={styles.stepTitle}>{currentStep.title}</Text>
            <Text style={styles.stepText}>{currentStep.text}</Text>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.navButton, isFirstStep && styles.navButtonDisabled]}
                onPress={prevStep}
                disabled={isFirstStep}
              >
                <Text style={styles.navButtonText}>前へ</Text>
              </Pressable>

              <Pressable
                style={[styles.navButton, styles.nextButton]}
                onPress={nextStep}
              >
                <Text style={styles.nextButtonText}>
                  {isLastStep ? '完了' : '次へ'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
