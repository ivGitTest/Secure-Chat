import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

  async function handleCheck() {
    setChecking(true);
    try {
      const info = await checkForUpdate(true); // ручная проверка — без суточного лимита
      setUpdate(info);
      setChecked(true); // «У вас последняя версия» — только при успешном ответе сервера
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
      <View style={styles.card}>
        <Row label="Версия" value={`${getCurrentVersionName()} (${getCurrentVersionCode()})`} />
        <View style={styles.divider} />
        <Row label="Дата сборки" value={formatDate(getBuildDate())} />
      </View>

      {update ? (
        <View style={styles.updateCard}>
          <View style={styles.updateHeader}>
            <Ionicons name="arrow-up-circle" size={22} color={C.primary} />
            <Text style={styles.updateTitle}>
              Доступна версия {update.versionName}
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
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void handleInstall()}>
              <Text style={styles.primaryBtnText}>Обновить</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : checked ? (
        <View style={styles.upToDate}>
          <Ionicons name="checkmark-circle" size={20} color={C.primary} />
          <Text style={styles.upToDateText}>У вас последняя версия</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => void handleCheck()}
        disabled={checking || downloading}
      >
        {checking ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <Text style={styles.secondaryBtnText}>Проверить обновления</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: C.card ?? '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  rowLabel: { fontSize: 15, color: C.mutedForeground, fontFamily: 'Inter_400Regular' },
  rowValue: { fontSize: 15, color: C.text, fontFamily: 'Inter_600SemiBold' },
  updateCard: {
    backgroundColor: C.card ?? '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.primary,
    padding: 16,
    gap: 8,
  },
  updateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  updateTitle: { fontSize: 16, color: C.text, fontFamily: 'Inter_600SemiBold' },
  updateMeta: { fontSize: 13, color: C.mutedForeground, fontFamily: 'Inter_400Regular' },
  changelog: { fontSize: 14, color: C.text, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  progressWrap: { marginTop: 8, gap: 6 },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.primary },
  progressText: {
    fontSize: 13,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  upToDate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  upToDateText: { fontSize: 15, color: C.text, fontFamily: 'Inter_500Medium' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: C.card ?? '#fff',
  },
  secondaryBtnText: { color: C.primary, fontSize: 16, fontFamily: 'Inter_500Medium' },
});
