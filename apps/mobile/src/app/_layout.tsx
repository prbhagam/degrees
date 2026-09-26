// Owner: shared mobile scaffold (Charles) — providers + root Stack. Feature owners add screens as files
// under src/app/ that re-export from src/features/<feature>/, so this file should rarely change.
import '../global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/lib/query';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ title: 'Degrees' }} />
      </Stack>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
