// app/_layout.jsx
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider, useTheme } from "./theme";

// We keep a wrapper so we can read theme values inside Tabs
function TabsWrapper() {
  const { palette } = useTheme();

  const BG = palette.BG;
  const CARD = palette.CARD;
  const TEXT = palette.TEXT;
  const MUTED = palette.MUTED;
  const PRIMARY = palette.PRIMARY;
  const BORDER = palette.BORDER;

  return (
    <><Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: BG,
        },
        headerTitleStyle: {
          color: TEXT,
          fontSize: 20,
          fontWeight: "700",
        },
        headerTintColor: TEXT,

        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 24,
          backgroundColor: CARD,
          borderTopColor: BORDER,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
          borderTopWidth: 1,
          elevation: 8,
        },

        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: MUTED,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },

        sceneStyle: {
          backgroundColor: BG,
          paddingBottom: 90,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Personal",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "wallet" : "wallet-outline"}
              size={size}
              color={color} />
          ),
        }} />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={size}
              color={color} />
          ),
        }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={size}
              color={color} />
          ),
        }} />
    </Tabs></>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <TabsWrapper />
    </ThemeProvider>
  );
}
