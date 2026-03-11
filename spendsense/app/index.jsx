// app/index.jsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "./theme";
import { useFocusEffect } from "@react-navigation/native";

import {
  trackScreen,
  trackPersonalExpenseCreated,
  trackPersonalExpenseUpdated,
  trackPersonalExpenseDeleted,
  trackPersonalStatsOpened,
} from "./api/telemetryEvents";

const PERSONAL_KEY = "@spendsense_personal_expenses";

export default function PersonalScreen() {
  const { palette } = useTheme();

  const [expenses, setExpenses] = useState([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isStatsModalVisible, setIsStatsModalVisible] = useState(false);

  // form fields
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  // editing
  const [editingId, setEditingId] = useState(null);

  // current month being viewed (Date object 1st day of month)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // whether to show all-time list instead of the selected month
  const [showAll, setShowAll] = useState(false);

  // ---------- Telemetry: screen view ----------
  useFocusEffect(
    React.useCallback(() => {
      trackScreen("Personal");
    }, [])
  );

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const json = await AsyncStorage.getItem(PERSONAL_KEY);
      if (json) {
        const parsed = JSON.parse(json).map((e) => {
          // normalize: ensure each expense has dateISO (so monthly filtering is reliable)
          if (!e.dateISO && e.date) {
            const parts = e.date.split("/");
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              const dt = new Date(year, month, day);
              return { ...e, dateISO: dt.toISOString() };
            }
          }
          return e;
        });
        setExpenses(parsed);
      }
    } catch (error) {
      console.log("Error loading personal expenses", error);
    }
  };

  const saveExpenses = async (next) => {
    try {
      await AsyncStorage.setItem(PERSONAL_KEY, JSON.stringify(next));
    } catch (error) {
      console.log("Error saving personal expenses", error);
    }
  };

  // Totals (all-time)
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // compute "today" based on stored date string
  const todayString = new Date().toLocaleDateString("en-IN");
  const todayTotal = expenses.reduce((sum, e) => {
    if (!e.date) return sum;
    return e.date === todayString ? sum + (e.amount || 0) : sum;
  }, 0);

  // ---------- Monthly filtering and stats ----------
  const isInMonth = (expense, monthDate) => {
    if (!expense.dateISO) return false;
    const d = new Date(expense.dateISO);
    return (
      d.getFullYear() === monthDate.getFullYear() &&
      d.getMonth() === monthDate.getMonth()
    );
  };

  // expenses to display based on currentMonth or all-time
  const visibleExpenses = showAll
    ? expenses
    : expenses.filter((e) => isInMonth(e, currentMonth));

  const monthlyTotal = expenses
    .filter((e) => isInMonth(e, currentMonth))
    .reduce((s, e) => s + (e.amount || 0), 0);

  const monthlyCount = expenses.filter((e) => isInMonth(e, currentMonth)).length;

  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };
  const setThisMonth = () => {
    const d = new Date();
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  // Monthly stats: totals per category for currentMonth
  const monthlyCategoryStats = () => {
    const items = expenses.filter((e) => isInMonth(e, currentMonth));
    const byCat = items.reduce((acc, it) => {
      const key = it.category || "Uncategorized";
      acc[key] = (acc[key] || 0) + (it.amount || 0);
      return acc;
    }, {});
    return Object.keys(byCat).map((k) => ({ category: k, total: byCat[k] }));
  };

  // ---------- Add / Edit ----------
  const openAddModal = () => {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setCategory("");
    setIsAddModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setTitle(item.title || "");
    setAmount((item.amount || "").toString());
    setCategory(item.category || "");
    setIsAddModalVisible(true);
  };

  const handleCloseAdd = () => {
    setIsAddModalVisible(false);
    setTitle("");
    setAmount("");
    setCategory("");
    setEditingId(null);
  };

  const handleSaveExpense = async () => {
    if (!title.trim() || !amount.trim()) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return;

    const nowISO = new Date().toISOString();
    const todayDateString = new Date().toLocaleDateString("en-IN");

    if (editingId) {
      const next = expenses.map((e) =>
        e.id === editingId
          ? {
              ...e,
              title: title.trim(),
              amount: numericAmount,
              category: category.trim() || null,
              dateISO: e.dateISO || nowISO,
              date: e.date || todayDateString,
            }
          : e
      );
      setExpenses(next);
      await saveExpenses(next);

      // Telemetry: expense updated
      const updated = next.find((e) => e.id === editingId);
      if (updated) {
        trackPersonalExpenseUpdated(updated);
      }

      handleCloseAdd();
      return;
    }

    const newExpense = {
      id: Date.now().toString(),
      title: title.trim(),
      amount: numericAmount,
      category: category.trim() || null,
      date: todayDateString,
      dateISO: nowISO,
    };

    const next = [newExpense, ...expenses];
    setExpenses(next);
    await saveExpenses(next);

    // Telemetry: expense created
    trackPersonalExpenseCreated(newExpense);

    handleCloseAdd();
  };

  // ---------- Delete ----------
  const confirmDelete = (id) => {
    Alert.alert(
      "Delete expense",
      "Are you sure you want to delete this expense?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(id),
        },
      ]
    );
  };

  const handleDelete = async (id) => {
    const existing = expenses.find((e) => e.id === id);

    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    await saveExpenses(next);

    // Telemetry: expense deleted
    if (existing) {
      trackPersonalExpenseDeleted(existing);
    }
  };

  // ---------- Render ----------
  const styles = makeStyles(palette);

  const renderExpense = ({ item }) => (
    <View style={styles.expenseCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseTitle}>{item.title}</Text>
        {item.category ? (
          <Text style={styles.expenseCategory}>{item.category}</Text>
        ) : null}
        {item.date ? <Text style={styles.expenseDate}>{item.date}</Text> : null}
      </View>

      <View
        style={{
          alignItems: "flex-end",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text style={styles.expenseAmount}>₹ {item.amount}</Text>

        <TouchableOpacity
          onPress={() => openEdit(item)}
          style={{ marginLeft: 10, padding: 6 }}
          accessibilityLabel="Edit expense"
        >
          <Ionicons name="create-outline" size={18} color={palette.MUTED} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => confirmDelete(item.id)}
          style={{ marginLeft: 4, padding: 6 }}
          accessibilityLabel="Delete expense"
        >
          <Ionicons name="trash-outline" size={18} color="#F87171" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // For month display label — SHORT format to save space ("Nov 2025")
  const monthLabel = (d) =>
    d.toLocaleString("default", { month: "short", year: "numeric" });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.appTitle}>SpendSense</Text>
          <Text style={styles.appSubtitle}>Personal expense tracker</Text>
        </View>
        <View className="avatar" style={styles.avatar}>
          <Text style={styles.avatarText}>₹</Text>
        </View>
      </View>

      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Total spent</Text>
            <Text style={styles.summaryValue}>₹ {total.toFixed(0)}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Ionicons name="trending-up" size={18} color="#22C55E" />
            <Text style={styles.summaryChipText}>On track</Text>
          </View>
        </View>
        <View style={styles.summaryRowBottom}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Today</Text>
            <Text style={styles.summaryItemValue}>₹ {todayTotal}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Entries</Text>
            <Text style={styles.summaryItemValue}>{expenses.length}</Text>
          </View>
        </View>
      </View>

      {/* Small monthly card */}
      <View style={styles.smallCard}>
        {/* Left: month navigation */}
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={18} color={palette.MUTED} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={setThisMonth}
            style={{ paddingHorizontal: 6, flex: 1 }}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                color: palette.TEXT,
                fontWeight: "700",
                fontSize: 13,
                flexShrink: 1,
              }}
            >
              {monthLabel(currentMonth)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette.MUTED}
            />
          </TouchableOpacity>
        </View>

        {/* Right: month total + toggles */}
        <View style={styles.smallRightBlock}>
          <View style={{ marginRight: 8, alignItems: "flex-end" }}>
            <Text style={{ color: palette.MUTED, fontSize: 11 }}>
              This month
            </Text>
            <Text
              style={{
                color: palette.TEXT,
                fontSize: 14,
                fontWeight: "800",
              }}
            >
              ₹ {monthlyTotal.toFixed(0)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowAll((s) => !s)}
            style={styles.smallToggle}
          >
            <Text
              style={{
                color: palette.PRIMARY,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {showAll ? "Month" : "All"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              trackPersonalStatsOpened(monthLabel(currentMonth));
              setIsStatsModalVisible(true);
            }}
            style={styles.statsButton}
          >
            <Ionicons name="stats-chart" size={18} color="#BBF7D0" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {showAll ? "All expenses" : "Recent expenses"}
        </Text>
      </View>

      {/* Expenses list */}
      {visibleExpenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="file-tray-outline" size={40} color={palette.MUTED} />
          <Text style={styles.emptyTitle}>No expenses yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap “Add expense” to start tracking your spending.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleExpenses}
          keyExtractor={(item, index) =>
            item.id?.toString() || index.toString()
          }
          renderItem={renderExpense}
          contentContainerStyle={{ paddingBottom: 160 }}
        />
      )}

      {/* FAB: Add Expense */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 30 }]}
        onPress={openAddModal}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>Add expense</Text>
      </TouchableOpacity>

      {/* Add / Edit Expense Modal */}
      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseAdd}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleCloseAdd}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit expense" : "Add expense"}
              </Text>
              <Pressable onPress={handleCloseAdd}>
                <Ionicons name="close" size={22} color={palette.MUTED} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Coffee, Groceries"
              placeholderTextColor={palette.MUTED}
              style={styles.input}
            />

            <Text style={styles.modalLabel}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 250"
              keyboardType="numeric"
              placeholderTextColor={palette.MUTED}
              style={styles.input}
            />

            <Text style={styles.modalLabel}>Category (optional)</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. Food, Travel"
              placeholderTextColor={palette.MUTED}
              style={styles.input}
            />

            <TouchableOpacity
              style={[
                styles.modalButton,
                (!title.trim() || !amount.trim()) && { opacity: 0.4 },
              ]}
              disabled={!title.trim() || !amount.trim()}
              onPress={handleSaveExpense}
            >
              <Text style={styles.modalButtonText}>
                {editingId ? "Save changes" : "Save"}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Monthly Stats Modal */}
      <Modal
        visible={isStatsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsStatsModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsStatsModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Monthly stats — {monthLabel(currentMonth)}
              </Text>
              <Pressable onPress={() => setIsStatsModalVisible(false)}>
                <Ionicons name="close" size={22} color={palette.MUTED} />
              </Pressable>
            </View>

            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.modalLabel, { marginTop: 0 }]}>Total</Text>
              <Text
                style={{
                  color: palette.TEXT,
                  fontWeight: "800",
                  fontSize: 18,
                }}
              >
                ₹ {monthlyTotal.toFixed(0)}
              </Text>
            </View>

            <Text style={[styles.modalLabel]}>By category</Text>
            <FlatList
              data={monthlyCategoryStats()}
              keyExtractor={(it) => it.category}
              renderItem={({ item }) => (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: palette.TEXT }}>
                    {item.category}
                  </Text>
                  <Text
                    style={{
                      color: palette.TEXT,
                      fontWeight: "700",
                    }}
                  >
                    ₹ {item.total.toFixed(0)}
                  </Text>
                </View>
              )}
              ItemSeparatorComponent={() => (
                <View
                  style={{
                    height: 1,
                    backgroundColor: palette.BORDER || "#0B1220",
                    marginVertical: 4,
                  }}
                />
              )}
            />

            <TouchableOpacity
              style={[styles.modalButton, { marginTop: 12 }]}
              onPress={() => setIsStatsModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// dynamic styles factory so UI follows palette
function makeStyles(p) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.BG,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    appTitle: {
      color: p.TEXT,
      fontSize: 24,
      fontWeight: "800",
    },
    appSubtitle: {
      color: p.MUTED,
      fontSize: 13,
      marginTop: 4,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: p.CARD,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: p.PRIMARY,
    },
    avatarText: {
      color: p.TEXT,
      fontWeight: "700",
    },
    summaryCard: {
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 24,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
    },

    smallCard: {
      backgroundColor: p.CARD,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: p.BORDER || "#0B1220",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      overflow: "hidden",
    },

    smallRightBlock: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      minWidth: 140,
    },

    smallToggle: {
      backgroundColor: "transparent",
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(79,70,229,0.15)",
      maxWidth: 70,
      alignItems: "center",
      justifyContent: "center",
    },

    statsButton: {
      marginLeft: 8,
      padding: 6,
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      color: p.MUTED,
      fontSize: 13,
    },
    summaryValue: {
      color: p.TEXT,
      fontSize: 28,
      fontWeight: "800",
      marginTop: 4,
    },
    summaryChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#022C22",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    summaryChipText: {
      color: "#BBF7D0",
      fontSize: 12,
      marginLeft: 6,
      fontWeight: "600",
    },
    summaryRowBottom: {
      flexDirection: "row",
      marginTop: 18,
      justifyContent: "space-between",
    },
    summaryItem: {
      flex: 1,
    },
    summaryItemLabel: {
      color: p.MUTED,
      fontSize: 12,
    },
    summaryItemValue: {
      color: p.TEXT,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 4,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    sectionTitle: {
      color: p.TEXT,
      fontSize: 16,
      fontWeight: "700",
    },
    expenseCard: {
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      borderWidth: 1,
      borderColor: p.BORDER || "#111827",
    },
    expenseTitle: {
      color: p.TEXT,
      fontSize: 15,
      fontWeight: "600",
    },
    expenseCategory: {
      color: p.MUTED,
      fontSize: 12,
      marginTop: 2,
    },
    expenseDate: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 2,
    },
    expenseAmount: {
      color: "#F97316",
      fontSize: 16,
      fontWeight: "700",
      marginLeft: 12,
    },
    emptyState: {
      alignItems: "center",
      marginTop: 48,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      color: p.TEXT,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 16,
    },
    emptySubtitle: {
      color: p.MUTED,
      fontSize: 13,
      textAlign: "center",
      marginTop: 6,
    },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 30,
      flexDirection: "row",
      backgroundColor: p.PRIMARY,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      alignItems: "center",
      elevation: 6,
    },

    fabText: {
      color: "#FFFFFF",
      fontWeight: "700",
      marginLeft: 8,
      fontSize: 14,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.7)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: p.CARD,
      padding: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    modalTitle: {
      color: p.TEXT,
      fontSize: 18,
      fontWeight: "700",
    },
    modalLabel: {
      color: p.MUTED,
      fontSize: 13,
      marginBottom: 6,
      marginTop: 6,
    },
    input: {
      backgroundColor: p.CARD,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: p.TEXT,
      fontSize: 14,
    },
    modalButton: {
      backgroundColor: p.PRIMARY,
      borderRadius: 999,
      paddingVertical: 11,
      alignItems: "center",
      marginTop: 16,
    },
    modalButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
  });
}
