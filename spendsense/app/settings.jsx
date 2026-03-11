// app/settings.jsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import { useTheme } from "./theme";

import { submitUserFeedback } from "./api/telemetry";
import {
  trackSettingsStatsOpened,
  trackDataExported,
  trackDataReset,
  trackProfileUpdated,
} from "./api/telemetryEvents";

// Storage keys
const PERSONAL_KEY = "@spendsense_personal_expenses";
const GROUPS_KEY = "@spendsense_groups";
const ACTIVE_GROUP_KEY = "@spendsense_active_group_id";
const THEME_KEY = "@spendsense_theme";
const NOTIFY_KEY = "@spendsense_notifications";
const PROFILE_KEY = "@spendsense_profile";

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, palette, toggleTheme } = useTheme();
  const styles = makeStyles(palette);

  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);

  // ---------- PROFILE ----------
  const [profile, setProfile] = useState(null);
  const [profileEditVisible, setProfileEditVisible] = useState(false);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNote, setEditNote] = useState("");

  const rawUserName = profile?.name?.trim();
  const CURRENT_USER_NAME =
    rawUserName && rawUserName.length ? rawUserName : "You";

  // ---------- STATS STATES ----------
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState({
    personalThisMonth: 0,
    groupThisMonth: 0,
    totalThisMonth: 0,
    personalAllTime: 0,
    groupAllTime: 0,
    totalAllTime: 0,
  });

  // ---------- FEEDBACK STATES ----------
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackExperience, setFeedbackExperience] = useState("satisfied");
  const [feedbackComments, setFeedbackComments] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  useEffect(() => {
    loadNotify();
    loadProfile();
  }, []);

  const loadNotify = async () => {
    try {
      const savedNotify = await AsyncStorage.getItem(NOTIFY_KEY);
      setNotifications(savedNotify === null ? true : savedNotify === "true");
    } catch (e) {
      console.error("[Settings] loadNotify error", e);
    }
  };

  const loadProfile = async () => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (raw) {
        setProfile(JSON.parse(raw));
      }
    } catch (e) {
      console.warn("[Settings] profile load error", e);
    }
  };

  const handleToggleTheme = (value) => {
    try {
      toggleTheme(value);
    } catch (e) {
      Alert.alert("Error", "Could not toggle theme.");
    }
  };

  const toggleNotifications = async (value) => {
    try {
      setNotifications(value);
      await AsyncStorage.setItem(NOTIFY_KEY, value ? "true" : "false");
    } catch (e) {
      Alert.alert("Error", "Could not save notification preference.");
    }
  };

  // ---------- DATE HELPERS ----------
  const getMonthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  };
  const getCurrentMonthKey = () => getMonthKey(new Date());

  // ---------- TRACK EXPENSES ----------
  const handleOpenStats = async () => {
    // Telemetry: user opened stats in settings
    trackSettingsStatsOpened();

    setStatsLoading(true);
    try {
      // PERSONAL
      let personal = [];
      const personalJson = await AsyncStorage.getItem(PERSONAL_KEY);
      if (personalJson) personal = JSON.parse(personalJson);

      const currentMonthKey = getCurrentMonthKey();

      let personalAllTime = 0;
      let personalThisMonth = 0;

      personal.forEach((e) => {
        const amount = Number(e.amount) || 0;
        personalAllTime += amount;

        if (e.date) {
          const [day, month, year] = e.date.split("/");
          const d = new Date(Number(year), Number(month) - 1, Number(day));
          if (getMonthKey(d) === currentMonthKey) {
            personalThisMonth += amount;
          }
        }
      });

      // GROUP SHARE (based on profile name)
      let groups = [];
      const groupsJson = await AsyncStorage.getItem(GROUPS_KEY);
      if (groupsJson) groups = JSON.parse(groupsJson);

      const nameLower = rawUserName ? rawUserName.toLowerCase() : null;

      let groupAllTime = 0;
      let groupThisMonth = 0;

      if (nameLower) {
        groups.forEach((g) => {
          const members = g.members || [];
          const expenses = g.expenses || [];

          const userIds = members
            .filter((m) => m.name?.toLowerCase() === nameLower)
            .map((m) => m.id);

          if (!userIds.length) return;

          expenses.forEach((exp) => {
            const participants = exp.participantIds || [];
            if (!participants.length) return;

            let perHead = exp.splits?.length
              ? exp.splits[0].share
              : (exp.amount || 0) / participants.length;

            const countUser = participants.filter((id) =>
              userIds.includes(id)
            ).length;
            if (!countUser) return;

            const share = perHead * countUser;

            const createdAt = exp.createdAt || new Date().toISOString();
            const expMonthKey = getMonthKey(createdAt);

            groupAllTime += share;
            if (expMonthKey === currentMonthKey) groupThisMonth += share;
          });
        });
      }

      const totalAllTime = personalAllTime + groupAllTime;
      const totalThisMonth = personalThisMonth + groupThisMonth;

      setStats({
        personalThisMonth,
        groupThisMonth,
        totalThisMonth,
        personalAllTime,
        groupAllTime,
        totalAllTime,
      });

      setStatsModalVisible(true);
    } catch (e) {
      console.error("Stats error", e);
      Alert.alert("Error", "Unable to compute stats.");
    } finally {
      setStatsLoading(false);
    }
  };

  // ---------- EXPORT ----------
  const handleExportData = async () => {
    setBusy(true);
    try {
      const personal = await AsyncStorage.getItem(PERSONAL_KEY);
      const groups = await AsyncStorage.getItem(GROUPS_KEY);
      const active = await AsyncStorage.getItem(ACTIVE_GROUP_KEY);

      const exportData = {
        personal_expenses: personal ? JSON.parse(personal) : [],
        groups: groups ? JSON.parse(groups) : [],
        active_group: active || null,
        exported_at: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      if (Platform.OS === "web") {
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spendsense-export-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        // Telemetry
        trackDataExported();

        Alert.alert("Export complete", "Downloaded JSON file.");
        setBusy(false);
        return;
      }

      const filename = `spendsense-export-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;

      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      const fileUri = dir + filename;

      await FileSystem.writeAsStringAsync(fileUri, jsonString);

      // Telemetry
      trackDataExported();

      Alert.alert("Export complete", `Saved to: ${fileUri}`);
    } catch (e) {
      Alert.alert("Error", "Failed to export data.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- RESET ----------
  const confirmResetData = () => {
    Alert.alert(
      "Reset all data?",
      "This will delete ALL expenses and groups permanently.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: handleResetData },
      ]
    );
  };

  const handleResetData = async () => {
    setBusy(true);
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const spendKeys = allKeys.filter((k) => k.startsWith("@spendsense"));
      const extras = [PROFILE_KEY];
      const toRemove = [...new Set([...spendKeys, ...extras])];

      await AsyncStorage.multiRemove(toRemove);
      await AsyncStorage.multiRemove([
        PERSONAL_KEY,
        GROUPS_KEY,
        ACTIVE_GROUP_KEY,
        THEME_KEY,
        NOTIFY_KEY,
      ]);

      setNotifications(true);
      toggleTheme(true);

      // Telemetry
      trackDataReset();

      Alert.alert("Done", "Data cleared. App will reload.", [
        {
          text: "OK",
          onPress: async () => {
            try {
              await Updates.reloadAsync();
            } catch {
              router.replace("/");
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert("Error", "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- PROFILE EDIT HELPERS ----------
  const openProfileEditor = () => {
    setEditName(profile?.name || "");
    setEditEmail(profile?.email || "");
    setEditPhone(profile?.phone || "");
    setEditNote(profile?.note || "");
    setProfileEditVisible(true);
  };

  const saveProfileInsideSettings = async () => {
    try {
      const payload = {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        note: editNote.trim(),
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
      setProfile(payload);

      // Telemetry
      trackProfileUpdated(payload);

      setProfileEditVisible(false);
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e) {
      console.error("[Settings] profile save error", e);
      Alert.alert("Error", "Failed to save profile.");
    }
  };

  // ---------- FEEDBACK HANDLER ----------
  const handleSubmitFeedback = async () => {
    if (!feedbackRating) {
      Alert.alert("Feedback", "Please select a rating from 1 to 5.");
      return;
    }

    setFeedbackBusy(true);
    try {
      await submitUserFeedback({
        rating: feedbackRating,
        experience: feedbackExperience,
        comments: feedbackComments,
      });

      Alert.alert("Thank you!", "Your feedback has been submitted.");
      setFeedbackComments("");
      // optional: reset rating/experience as well
      // setFeedbackRating(0);
      // setFeedbackExperience("satisfied");
    } catch (e) {
      Alert.alert(
        "Error",
        "Could not send feedback right now. Please try again later."
      );
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.screenSubtitle}>
            Personalize your SpendSense experience
          </Text>
        </View>

        {/* ---- TRACK EXPENSES CARD ---- */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={handleOpenStats}
          activeOpacity={0.8}
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color={palette.TEXT} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{CURRENT_USER_NAME}</Text>
            <Text style={styles.profileMeta}>
              Tap to track your total expenses
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: palette.PRIMARY,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Ionicons name="stats-chart-outline" size={16} color="#fff" />
            <Text
              style={{
                color: "#fff",
                fontSize: 11,
                fontWeight: "600",
                marginLeft: 4,
              }}
            >
              Track
            </Text>
          </View>
        </TouchableOpacity>

        {/* ---- PREFERENCES ---- */}
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Dark mode</Text>
            <Text style={styles.settingDescription}>
              Always use the dark theme in the app.
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={handleToggleTheme}
            thumbColor={isDark ? "#fff" : "#ccc"}
            trackColor={{ true: palette.PRIMARY, false: "#4B5563" }}
            disabled={busy}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Text style={styles.settingDescription}>
              Get reminders about your spending.
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={toggleNotifications}
            thumbColor={notifications ? "#fff" : "#ccc"}
            trackColor={{ true: palette.PRIMARY, false: "#4B5563" }}
            disabled={busy}
          />
        </View>

        {/* ---- PROFILE SECTION ---- */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Profile</Text>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={openProfileEditor}
          disabled={busy}
        >
          <View style={styles.linkIcon}>
            <Ionicons name="create-outline" size={18} color={palette.TEXT} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Edit profile</Text>
            <Text style={styles.settingDescription}>
              Change your name, email & phone number.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.MUTED} />
        </TouchableOpacity>

        {/* ---- DATA ---- */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Data</Text>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={handleExportData}
          disabled={busy}
        >
          <View style={styles.linkIcon}>
            <Ionicons
              name="cloud-upload-outline"
              size={18}
              color={palette.TEXT}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Export data</Text>
            <Text style={styles.settingDescription}>
              Save all your SpendSense data as a JSON file.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.MUTED} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={confirmResetData}
          disabled={busy}
        >
          <View style={[styles.linkIcon, { borderColor: "#F97316" }]}>
            <Ionicons name="trash-bin-outline" size={18} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: "#F97316" }]}>
              Reset all data
            </Text>
            <Text style={styles.settingDescription}>
              Permanently delete all expenses and groups.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.MUTED} />
        </TouchableOpacity>

        {/* ---- FEEDBACK ---- */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Feedback</Text>

        <View style={styles.feedbackCard}>
          <Text style={styles.settingLabel}>Rate your experience</Text>

          {/* Stars */}
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setFeedbackRating(star)}
                style={{ marginRight: 4 }}
              >
                <Ionicons
                  name={star <= feedbackRating ? "star" : "star-outline"}
                  size={22}
                  color={star <= feedbackRating ? "#FACC15" : palette.MUTED}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Experience pills */}
          <View style={styles.feedbackPillRow}>
            {[
              { key: "good", label: "Good" },
              { key: "satisfied", label: "Satisfied" },
              { key: "needs_improvement", label: "Needs improvement" },
            ].map((opt) => {
              const selected = feedbackExperience === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.feedbackPill,
                    selected && styles.feedbackPillSelected,
                  ]}
                  onPress={() => setFeedbackExperience(opt.key)}
                >
                  <Text
                    style={[
                      styles.feedbackPillText,
                      selected && styles.feedbackPillTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Comments */}
          <TextInput
            value={feedbackComments}
            onChangeText={setFeedbackComments}
            placeholder="Any comments or suggestions?"
            placeholderTextColor={palette.MUTED}
            style={[
              styles.input,
              { marginTop: 10, minHeight: 70, textAlignVertical: "top" },
            ]}
            multiline
          />

          <TouchableOpacity
            style={[
              styles.feedbackButton,
              (feedbackBusy || !feedbackRating) && { opacity: 0.5 },
            ]}
            disabled={feedbackBusy || !feedbackRating}
            onPress={handleSubmitFeedback}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {feedbackBusy ? "Sending..." : "Submit feedback"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ---- ABOUT ---- */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>About</Text>

        <View style={styles.footerTextContainer}>
          <Text style={styles.footerText}>SpendSense • v0.2</Text>
          <Text style={styles.footerSubText}>
            Built with Expo, React Native & Expo Router
          </Text>
        </View>
      </ScrollView>

      {/* ---------- STATS MODAL ---------- */}
      <Modal
        visible={statsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatsModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
          onPress={() => setStatsModalVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: palette.CARD,
              padding: 16,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: palette.BORDER,
              maxHeight: "80%",
            }}
            onPress={() => {}}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* HEADER */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      backgroundColor: palette.CARD_ELEVATED,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{ color: palette.TEXT, fontWeight: "700" }}
                    >
                      {CURRENT_USER_NAME[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ marginLeft: 8 }}>
                    <Text
                      style={{
                        color: palette.TEXT,
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      {CURRENT_USER_NAME}'s expenses
                    </Text>
                    <Text style={{ color: palette.MUTED, fontSize: 12 }}>
                      Personal + group share overview
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => setStatsModalVisible(false)}>
                  <Ionicons name="close" size={22} color={palette.MUTED} />
                </Pressable>
              </View>

              {statsLoading ? (
                <Text
                  style={{
                    color: palette.MUTED,
                    textAlign: "center",
                    paddingVertical: 20,
                  }}
                >
                  Calculating...
                </Text>
              ) : (
                <>
                  {/* THIS MONTH */}
                  <View style={styles.statsCard}>
                    <Text style={styles.statsCardLabel}>This month</Text>
                    <Text style={styles.statsCardValue}>
                      ₹ {stats.totalThisMonth.toFixed(0)}
                    </Text>

                    <View style={styles.statsRow}>
                      <Text style={styles.statsRowLabel}>Personal</Text>
                      <Text style={styles.statsRowValue}>
                        ₹ {stats.personalThisMonth.toFixed(0)}
                      </Text>
                    </View>

                    <View style={styles.statsRow}>
                      <Text style={styles.statsRowLabel}>
                        Groups (your share)
                      </Text>
                      <Text style={styles.statsRowValue}>
                        ₹ {stats.groupThisMonth.toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  {/* ALL TIME */}
                  <View style={styles.statsCard}>
                    <Text style={styles.statsCardLabel}>All time</Text>
                    <Text style={styles.statsCardValue}>
                      ₹ {stats.totalAllTime.toFixed(0)}
                    </Text>

                    <View style={styles.statsRow}>
                      <Text style={styles.statsRowLabel}>Personal</Text>
                      <Text style={styles.statsRowValue}>
                        ₹ {stats.personalAllTime.toFixed(0)}
                      </Text>
                    </View>

                    <View style={styles.statsRow}>
                      <Text style={styles.statsRowLabel}>
                        Groups (your share)
                      </Text>
                      <Text style={styles.statsRowValue}>
                        ₹ {stats.groupAllTime.toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={{
                      color: palette.MUTED,
                      fontSize: 11,
                      textAlign: "center",
                      marginTop: 6,
                    }}
                  >
                    Group share is calculated based on your saved profile name.
                  </Text>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---------- PROFILE EDIT MODAL ---------- */}
      <Modal
        visible={profileEditVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileEditVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
          onPress={() => setProfileEditVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: palette.CARD,
              padding: 16,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: palette.BORDER,
            }}
            onPress={() => {}}
          >
            <Text
              style={{
                color: palette.TEXT,
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 12,
              }}
            >
              Edit profile
            </Text>

            {/* Name */}
            <Text style={{ color: palette.MUTED, fontSize: 12 }}>Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={palette.MUTED}
            />

            {/* Email */}
            <Text
              style={{ color: palette.MUTED, fontSize: 12, marginTop: 10 }}
            >
              Email
            </Text>
            <TextInput
              value={editEmail}
              onChangeText={setEditEmail}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={palette.MUTED}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {/* Phone */}
            <Text
              style={{ color: palette.MUTED, fontSize: 12, marginTop: 10 }}
            >
              Phone
            </Text>
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              style={styles.input}
              placeholder="+91 98765 43210"
              placeholderTextColor={palette.MUTED}
              keyboardType="phone-pad"
            />

            {/* Note */}
            <Text
              style={{ color: palette.MUTED, fontSize: 12, marginTop: 10 }}
            >
              Note
            </Text>
            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              placeholder="Short bio"
              placeholderTextColor={palette.MUTED}
              multiline
            />

            <TouchableOpacity
              style={{
                backgroundColor: palette.PRIMARY,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                marginTop: 16,
              }}
              onPress={saveProfileInsideSettings}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Save changes
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- DYNAMIC STYLES ----------
function makeStyles(p) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.BG,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    headerRow: {
      marginBottom: 16,
    },
    screenTitle: {
      color: p.TEXT,
      fontSize: 24,
      fontWeight: "800",
    },
    screenSubtitle: {
      color: p.MUTED,
      fontSize: 13,
      marginTop: 4,
    },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: p.BORDER,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: p.CARD,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    profileName: {
      color: p.TEXT,
      fontSize: 16,
      fontWeight: "700",
    },
    profileMeta: {
      color: p.MUTED,
      fontSize: 12,
      marginTop: 2,
    },
    sectionTitle: {
      color: p.TEXT,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: p.BORDER,
    },
    settingLabel: {
      color: p.TEXT,
      fontSize: 14,
      fontWeight: "600",
    },
    settingDescription: {
      color: p.MUTED,
      fontSize: 12,
      marginTop: 2,
    },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: p.BORDER,
    },
    linkIcon: {
      width: 32,
      height: 32,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: p.BORDER,
      backgroundColor: p.CARD,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    footerTextContainer: {
      marginTop: 4,
    },
    footerText: {
      color: p.MUTED,
      fontSize: 12,
    },
    footerSubText: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 2,
    },

    // Stats Card
    statsCard: {
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: p.BORDER,
    },
    statsCardLabel: {
      color: p.MUTED,
      fontSize: 12,
    },
    statsCardValue: {
      color: p.TEXT,
      fontSize: 22,
      fontWeight: "800",
      marginTop: 4,
      marginBottom: 8,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    statsRowLabel: {
      color: p.MUTED,
      fontSize: 12,
    },
    statsRowValue: {
      color: p.TEXT,
      fontSize: 13,
      fontWeight: "600",
    },

    // Shared input style (profile edit modal & feedback)
    input: {
      backgroundColor: p.CARD,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.BORDER,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: p.TEXT,
      fontSize: 14,
      marginTop: 4,
    },

    // Feedback
    feedbackCard: {
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: p.BORDER,
    },
    feedbackPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 10,
      marginBottom: 4,
    },
    feedbackPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: p.BORDER,
      backgroundColor: p.CARD,
      marginRight: 6,
      marginBottom: 6,
    },
    feedbackPillSelected: {
      backgroundColor: p.PRIMARY,
      borderColor: p.PRIMARY,
    },
    feedbackPillText: {
      color: p.MUTED,
      fontSize: 12,
    },
    feedbackPillTextSelected: {
      color: "#FFFFFF",
      fontWeight: "600",
    },
    feedbackButton: {
      backgroundColor: p.PRIMARY,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 12,
    },
  });
}
