import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Simple icon renderer using unicode symbols — no extra deps needed.
// Swap for @expo/vector-icons if you want proper icons.
function TabIcon({
  symbol,
  focused,
}: {
  symbol: string;
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconDot, { opacity: focused ? 1 : 0.45 }]}>
        {/* text-based icons — replace with Ionicons etc. later */}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1a1a1a',
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#ec4899',   // pink-500
        tabBarInactiveTintColor: '#6b7280', // gray-500
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <TabSymbol color={color} icon="▶" />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <TabSymbol color={color} icon="⌕" />,
        }}
      />
      <Tabs.Screen
        name="generate"
        options={{
          title: 'Create',
          tabBarIcon: ({ color }) => <TabSymbol color={color} icon="✨" />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload',
          tabBarIcon: ({ color }) => <TabSymbol color={color} icon="＋" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabSymbol color={color} icon="◉" />,
        }}
      />
    </Tabs>
  );
}

function TabSymbol({ color, icon }: { color: string; icon: string }) {
  const { Text } = require('react-native');
  return (
    <Text style={{ color, fontSize: 20, lineHeight: 24 }}>{icon}</Text>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  iconDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#ec4899' },
});
