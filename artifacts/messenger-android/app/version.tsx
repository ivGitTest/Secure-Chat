import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/constants/colors';
import {
  checkForUpdate,
  downloadAndInstall,
  getBuildDate,
  getCurrentVersionCode,
  getCurrentVersionName,
  type UpdateInfo,
} from '@/services/updateService';

const INSTALLED_VERSION_KEY = 'update_installed_versioncode';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function VersionScreen() {
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [installedCode, setInstalledCode] = useState<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(INSTALLED_VERSION_KEY)
      .then((v) => setInstalledCode(v ? (parseInt(v, 10) || 0) : 0))
      .catch(() => setInstalledCode(0));
  }, []);

  async function handleCheck() {
    setChecking(true);
    try {
      const info = await checkForUpdate(true);
      setUpdate(info);
      setChecked(true);
    } catch (err) {
      setChecked(false);
      Alert.alert(
        'Не удалось проверить',
        err instanceof Error ? err.message : 'Сервер обновлений недоступен',
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    if (!update) return;
    setDownloading(true);
    setProgress(0);
    try {
      await downloadAndInstall(update, setProgress);
    } catch (err) {
      Alert.alert(
        'Ошибка обновления',
        err instanceof Error ? err.message : 'Не удалось скачать обновление',
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header with border */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>О приложении</Text>
      </View>

      {/* Version info — card with internal separator */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Версия</Text>
          <Text style={styles.infoValue}>
            {getCurrentVersionName()} ({getCurrentVersionCode()})
          </Text>
        </View>
        <View style={styles.infoSep} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Дата сборки</Text>
          <Text style={styles.infoValue}>{formatDate(getBuildDate())}</Text>
        </View>
        <View style={styles.infoSep} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>versionCode (APK)</Text>
          <Text style={styles.infoValue}>{getCurrentVersionCode()}</Text>
        </View>
        {installedCode !== null && installedCode > 0 ? (
          <>
            <View style={styles.infoSep} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>versionCode (updater)</Text>
              <Text style={[styles.infoValue,
                installedCode > getCurrentVersionCode() ? styles.infoWarn : null]}>
                {installedCode}
                {installedCode > getCurrentVersionCode() ? ' ⚠' : ''}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Update available */}
      {update ? (
        <View style={styles.updateCard}>
          <View style={styles.updateHeader}>
            <Ionicons name="arrow-up-circle" size={32} color={C.primary} />
            <Text style={styles.updateTitle}>
              Версия {update.versionName}
            </Text>
          </View>
          {update.releasedAt ? (
            <Text style={styles.updateMeta}>от {formatDate(update.releasedAt)}</Text>
          ) : null}
          {update.changelog ? (
            <Text style={styles.changelog}>{update.changelog}</Text>
          ) : null}

          {downloading ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void handleInstall()}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Обновить</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : checked ? (
        <View style={styles.upToDate}>
          <Ionicons name="checkmark-circle" size={24} color={C.primary} />
          <Text style={styles.upToDateText}>У вас последняя версия</Text>
        </View>
      ) : null}

      {/* Check button */}
      <TouchableOpacity
        style={styles.checkBtn}
        onPress={() => void handleCheck()}
        disabled={checking || downloading}
        activeOpacity={0.85}
      >
        {checking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.checkBtnText}>Проверить обновления</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingBottom: 48 },

  header: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    fontFamily: 'Inter_700Bold',
  },

  // Info card — white glass card with internal separator
  infoCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  infoSep: { height: 1.5, backgroundColor: C.border, marginHorizontal: 0 },
  infoLabel: {
    fontSize: 15,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    fontFamily: 'Inter_700Bold',
  },

  updateCard: {
    marginHorizontal: 32,
    marginBottom: 24,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: `${C.primary}33`,
    borderRadius: 28,
    padding: 28,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  updateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.primary,
    fontFamily: 'Inter_700Bold',
  },
  updateMeta: {
    fontSize: 16,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
  },
  changelog: {
    fontSize: 16,
    color: '#3F3F46', // zinc-700
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
    marginBottom: 20,
  },
  progressWrap: { gap: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 4 },
  progressText: {
    fontSize: 13,
    color: C.mutedForeground,
    fontFamily: 'Inter_700Bold',
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },

  upToDate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 32,
  },
  upToDateText: {
    fontSize: 17,
    color: C.text,
    fontFamily: 'Inter_500Medium',
  },
  infoWarn: {
    color: '#D97706', // amber-600
  },

  // Primary solid blue button — matches mockup c2-btn
  checkBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  checkBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
