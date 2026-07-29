import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Страница не найдена' }} />
      <View style={styles.container}>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title}>Страница не найдена</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>На главную</Text>
        </Link>
      </View>
    </>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    paddingHorizontal: 32,
    gap: 12,
  },
  code: {
    fontSize: 80,
    fontWeight: '700',
    color: C.border,
    letterSpacing: -4,
    fontFamily: 'Inter_700Bold',
    lineHeight: 88,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  link: {
    marginTop: 24,
    minHeight: 56,
    paddingHorizontal: 32,
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 20,
  },
  linkText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  },
});
