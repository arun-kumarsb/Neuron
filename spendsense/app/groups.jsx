// app/groups.jsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  SafeAreaView,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "./theme";
import { useFocusEffect } from "@react-navigation/native";

import {
  trackScreen,
  trackGroupCreated,
  trackGroupDeleted,
  trackGroupOpened,
  trackActiveGroupChanged,
  trackMemberAdded,
  trackMemberRemoved,
  trackMemberEdited,
  trackExpenseCreated,
  trackExpenseUpdated,
  trackExpenseDeleted,
  trackExpenseSettled,
  trackSettlementCreated,
} from "./api/telemetryEvents";

const GROUPS_KEY = "@spendsense_groups";
const ACTIVE_GROUP_KEY = "@spendsense_active_group_id";
const PROFILE_KEY = "@spendsense_profile";

export default function GroupsScreen() {
  const { palette } = useTheme();
  const styles = makeStyles(palette);

  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);

  // Profile (from settings/profile)
  const [profile, setProfile] = useState(null);
  const CURRENT_USER_NAME =
    profile?.name?.trim() && profile.name.trim().length > 0
      ? profile.name.trim()
      : "You";

  // Create group modal
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Group details (members + expenses) modal
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  // Member form
  const [memberName, setMemberName] = useState("");

  // Member editing
  const [editMemberModalVisible, setEditMemberModalVisible] = useState(false);
  const [memberBeingEdited, setMemberBeingEdited] = useState(null);
  const [memberEditName, setMemberEditName] = useState("");

  // Expense form
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [payerId, setPayerId] = useState(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);

  // Split mode: equal or custom
  const [splitMode, setSplitMode] = useState("equal"); // "equal" | "custom"
  const [customShares, setCustomShares] = useState({}); // { [memberId]: "amount" }

  // Expense editing
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  // Search + filter
  const [expenseSearch, setExpenseSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Settle up
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settleFromMember, setSettleFromMember] = useState(null);
  const [settleToMemberId, setSettleToMemberId] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");

  // Telemetry: screen view
  useFocusEffect(
    React.useCallback(() => {
      trackScreen("Groups");
    }, [])
  );

  // Load groups + active group + profile on mount
  useEffect(() => {
    (async () => {
      await loadGroups();
      await loadActiveGroup();
      await loadProfile();
    })();
  }, []);

  const loadGroups = async () => {
    try {
      const json = await AsyncStorage.getItem(GROUPS_KEY);
      if (json) setGroups(JSON.parse(json));
    } catch (error) {
      console.log("Error loading groups", error);
    }
  };

  const saveGroups = async (nextGroups) => {
    try {
      await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(nextGroups));
    } catch (error) {
      console.log("Error saving groups", error);
    }
  };

  const loadActiveGroup = async () => {
    try {
      const id = await AsyncStorage.getItem(ACTIVE_GROUP_KEY);
      if (id) setActiveGroupId(id);
    } catch (e) {
      console.log("Error loading active group", e);
    }
  };

  const loadProfile = async () => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (raw) {
        setProfile(JSON.parse(raw));
      }
    } catch (e) {
      console.log("Error loading profile", e);
    }
  };

  const updateGroupInList = async (updatedGroup) => {
    const next = groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
    setGroups(next);
    await saveGroups(next);
  };

  // ----- Active group -----
  const handleSetActiveGroup = async (groupId) => {
    setActiveGroupId(groupId);
    try {
      await AsyncStorage.setItem(ACTIVE_GROUP_KEY, groupId);
      trackActiveGroupChanged(groupId);
    } catch (e) {
      console.log("Error saving active group", e);
    }
  };

  // ----- Create group -----
  const handleOpenCreateModal = () => {
    setIsCreateModalVisible(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalVisible(false);
    setGroupName("");
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;

    // Auto-add logged-in user as first member if profile has a name
    let initialMembers = [];
    if (profile?.name?.trim()) {
      initialMembers.push({
        id: `self-${Date.now().toString()}`,
        name: profile.name.trim(),
      });
    }

    const newGroup = {
      id: Date.now().toString(),
      name: groupName.trim(),
      createdAt: new Date().toISOString(),
      members: initialMembers,
      expenses: [],
      settlements: [],
    };

    const next = [newGroup, ...groups];
    setGroups(next);
    await saveGroups(next);

    trackGroupCreated(newGroup);

    handleCloseCreateModal();
  };

  const handleDeleteGroup = (groupId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    Alert.alert(
      "Delete group?",
      `Are you sure you want to delete "${group.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const next = groups.filter((g) => g.id !== groupId);
            setGroups(next);
            await saveGroups(next);
            if (activeGroupId === groupId) {
              setActiveGroupId(null);
              await AsyncStorage.removeItem(ACTIVE_GROUP_KEY);
            }
            trackGroupDeleted(group);
          },
        },
      ]
    );
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  // ----- Group details + members + expenses -----
  const openGroupDetails = (groupId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const withDefaults = {
      ...group,
      members: group.members || [],
      expenses: group.expenses || [],
      settlements: group.settlements || [],
    };

    setSelectedGroup(withDefaults);

    const memberIds = withDefaults.members.map((m) => m.id);
    setPayerId(memberIds[0] || null);
    setSelectedParticipantIds(memberIds);
    setMemberName("");
    resetExpenseForm(withDefaults);
    setIsDetailsVisible(true);

    trackGroupOpened(withDefaults);
  };

  const closeGroupDetails = () => {
    setIsDetailsVisible(false);
    setSelectedGroup(null);
    setMemberName("");
    resetExpenseForm(null);
    setSelectedParticipantIds([]);
    setPayerId(null);
    setExpenseSearch("");
    setCategoryFilter("all");
  };

  // ----- Members -----
  const handleAddMember = async () => {
    if (!selectedGroup || !memberName.trim()) return;

    const newMember = {
      id: Date.now().toString(),
      name: memberName.trim(),
    };

    const updatedGroup = {
      ...selectedGroup,
      members: [...(selectedGroup.members || []), newMember],
    };

    setSelectedGroup(updatedGroup);
    setMemberName("");

    const memberIds = updatedGroup.members.map((m) => m.id);
    if (!payerId) setPayerId(memberIds[0] || null);
    if (selectedParticipantIds.length === 0) setSelectedParticipantIds(memberIds);

    await updateGroupInList(updatedGroup);
    trackMemberAdded(updatedGroup, newMember);
  };

  const handleRemoveMember = (memberId) => {
    if (!selectedGroup) return;

    const member = selectedGroup.members.find((m) => m.id === memberId);
    if (!member) return;

    Alert.alert(
      "Remove member?",
      `Remove "${member.name}" from this group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const filteredMembers = selectedGroup.members.filter(
              (m) => m.id !== memberId
            );

            const updatedGroup = {
              ...selectedGroup,
              members: filteredMembers,
            };

            setSelectedGroup(updatedGroup);

            if (payerId === memberId) {
              const remainingIds = filteredMembers.map((m) => m.id);
              setPayerId(remainingIds[0] || null);
            }
            setSelectedParticipantIds((prev) =>
              prev.filter((id) => id !== memberId)
            );
            setCustomShares((prev) => {
              const copy = { ...prev };
              delete copy[memberId];
              return copy;
            });

            await updateGroupInList(updatedGroup);
            trackMemberRemoved(updatedGroup, member);
          },
        },
      ]
    );
  };

  const handleEditMemberPress = (member) => {
    setMemberBeingEdited(member);
    setMemberEditName(member.name);
    setEditMemberModalVisible(true);
  };

  const handleSaveMemberEdit = async () => {
    if (!selectedGroup || !memberBeingEdited) return;
    const newName = memberEditName.trim();
    if (!newName) return;

    const updatedMembers = selectedGroup.members.map((m) =>
      m.id === memberBeingEdited.id ? { ...m, name: newName } : m
    );

    const updatedGroup = { ...selectedGroup, members: updatedMembers };
    setSelectedGroup(updatedGroup);
    await updateGroupInList(updatedGroup);

    trackMemberEdited(updatedGroup, memberBeingEdited, newName);

    setEditMemberModalVisible(false);
    setMemberBeingEdited(null);
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  };

  const renderMemberChip = (member) => (
    <TouchableOpacity
      key={member.id}
      style={styles.memberChip}
      onPress={() => handleEditMemberPress(member)}
      onLongPress={() => handleRemoveMember(member.id)}
      delayLongPress={300}
    >
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{getInitials(member.name)}</Text>
      </View>
      <Text style={styles.memberName}>{member.name}</Text>
    </TouchableOpacity>
  );

  // ----- Expenses helpers -----
  const getMemberName = (group, memberId) =>
    group?.members?.find((m) => m.id === memberId)?.name || "Unknown";

  const toggleParticipant = (memberId) => {
    setSelectedParticipantIds((prev) => {
      if (prev.includes(memberId)) {
        const next = prev.filter((id) => id !== memberId);
        setCustomShares((old) => {
          const copy = { ...old };
          delete copy[memberId];
          return copy;
        });
        return next;
      } else {
        return [...prev, memberId];
      }
    });
  };

  const handleCustomShareChange = (memberId, value) => {
    setCustomShares((prev) => ({
      ...prev,
      [memberId]: value,
    }));
  };

  function resetExpenseForm(groupForParticipants) {
    setEditingExpenseId(null);
    setExpenseDesc("");
    setExpenseCategory("");
    setExpenseAmount("");
    setSplitMode("equal");
    setCustomShares({});
    if (groupForParticipants && groupForParticipants.members) {
      const memberIds = groupForParticipants.members.map((m) => m.id);
      setSelectedParticipantIds(memberIds);
    } else if (selectedGroup?.members) {
      const memberIds = selectedGroup.members.map((m) => m.id);
      setSelectedParticipantIds(memberIds);
    } else {
      setSelectedParticipantIds([]);
    }
  }

  const startEditExpense = (expense) => {
    if (!selectedGroup) return;
    setEditingExpenseId(expense.id);
    setExpenseDesc(expense.description || "");
    setExpenseCategory(expense.category || "");
    setExpenseAmount(String(expense.amount || ""));
    setPayerId(expense.payerId || null);

    const participants = expense.participantIds || [];
    setSelectedParticipantIds(participants);

    if (expense.splits && expense.splits.length) {
      const first = expense.splits[0].share;
      const allEqual = expense.splits.every(
        (s) => Math.abs(s.share - first) < 0.01
      );
      if (
        allEqual &&
        participants.length &&
        participants.length === expense.splits.length
      ) {
        setSplitMode("equal");
        setCustomShares({});
      } else {
        setSplitMode("custom");
        const cs = {};
        expense.splits.forEach((s) => {
          cs[s.memberId] = String(s.share);
        });
        setCustomShares(cs);
      }
    } else {
      setSplitMode("equal");
      setCustomShares({});
    }
  };

  // ----- Add / update expense (equal / custom) -----
  const handleSubmitExpense = async () => {
    if (!selectedGroup) return;
    if (!expenseDesc.trim() || !expenseAmount.trim()) return;

    const numericAmount = parseFloat(expenseAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) return;
    if (!payerId) return;

    const participants =
      selectedParticipantIds.length > 0
        ? selectedParticipantIds
        : selectedGroup.members.map((m) => m.id);

    if (participants.length === 0) return;

    let splits = [];

    if (splitMode === "equal") {
      const perHeadRaw = numericAmount / participants.length;
      const perHead = Math.round(perHeadRaw * 100) / 100;

      splits = participants.map((id) => ({
        memberId: id,
        share: perHead,
      }));
    } else {
      // custom amounts
      let totalCustom = 0;
      const tempSplits = [];

      participants.forEach((id) => {
        const raw = customShares[id];
        const amount = parseFloat(raw);
        if (!isNaN(amount) && amount > 0) {
          tempSplits.push({ memberId: id, share: amount });
          totalCustom += amount;
        }
      });

      if (!tempSplits.length) {
        Alert.alert(
          "Invalid split",
          "Enter at least one positive amount for the custom split."
        );
        return;
      }

      if (Math.abs(totalCustom - numericAmount) > 0.5) {
        Alert.alert(
          "Amount mismatch",
          "The sum of custom shares does not match the total amount. Please check again."
        );
        return;
      }

      splits = tempSplits;
    }

    if (editingExpenseId) {
      // update existing expense
      let updatedExpenseRef = null;
      const updatedExpenses = (selectedGroup.expenses || []).map((e) => {
        if (e.id === editingExpenseId) {
          const updated = {
            ...e,
            description: expenseDesc.trim(),
            category: expenseCategory.trim() || null,
            amount: numericAmount,
            payerId,
            participantIds:
              splitMode === "custom"
                ? splits.map((s) => s.memberId)
                : participants,
            splits,
          };
          updatedExpenseRef = updated;
          return updated;
        }
        return e;
      });

      const updatedGroup = {
        ...selectedGroup,
        expenses: updatedExpenses,
      };

      setSelectedGroup(updatedGroup);
      await updateGroupInList(updatedGroup);

      if (updatedExpenseRef) {
        trackExpenseUpdated(updatedGroup, updatedExpenseRef);
      }
    } else {
      // create new expense
      const newExpense = {
        id: Date.now().toString(),
        description: expenseDesc.trim(),
        category: expenseCategory.trim() || null,
        amount: numericAmount,
        payerId,
        participantIds:
          splitMode === "custom" ? splits.map((s) => s.memberId) : participants,
        createdAt: new Date().toISOString(),
        splits,
        isSettled: false,
      };

      const updatedGroup = {
        ...selectedGroup,
        expenses: [newExpense, ...(selectedGroup.expenses || [])],
      };

      setSelectedGroup(updatedGroup);
      await updateGroupInList(updatedGroup);

      trackExpenseCreated(updatedGroup, newExpense);
    }

    resetExpenseForm(selectedGroup);
  };

  const handleDeleteExpense = (expenseId) => {
    if (!selectedGroup) return;

    const expense = selectedGroup.expenses.find((e) => e.id === expenseId);
    if (!expense) return;

    Alert.alert(
      "Delete expense?",
      `Delete "${expense.description}" (₹${expense.amount}) from this group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const updatedGroup = {
              ...selectedGroup,
              expenses: selectedGroup.expenses.filter((e) => e.id !== expenseId),
            };
            setSelectedGroup(updatedGroup);
            await updateGroupInList(updatedGroup);
            if (editingExpenseId === expenseId) {
              resetExpenseForm(updatedGroup);
            }
            trackExpenseDeleted(updatedGroup, expense);
          },
        },
      ]
    );
  };

  const handleToggleSettleExpense = async (expenseId) => {
    if (!selectedGroup) return;

    let toggledExpense = null;
    const updatedExpenses = selectedGroup.expenses.map((e) => {
      if (e.id === expenseId) {
        const updated = { ...e, isSettled: !e.isSettled };
        toggledExpense = updated;
        return updated;
      }
      return e;
    });

    const updatedGroup = {
      ...selectedGroup,
      expenses: updatedExpenses,
    };

    setSelectedGroup(updatedGroup);
    await updateGroupInList(updatedGroup);

    if (toggledExpense) {
      trackExpenseSettled(updatedGroup, toggledExpense);
    }
  };

  const handleExpenseLongPress = (expense) => {
    const isSettled = !!expense.isSettled;

    Alert.alert(
      "Expense options",
      `"${expense.description}" (₹${expense.amount})`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isSettled ? "Mark as unpaid" : "Mark as paid",
          onPress: () => handleToggleSettleExpense(expense.id),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDeleteExpense(expense.id),
        },
      ]
    );
  };

  const renderExpenseRow = (expense) => {
    const payerName = getMemberName(selectedGroup, expense.payerId);

    let perHead = null;
    let isCustom = false;

    if (expense.splits && expense.splits.length) {
      const first = expense.splits[0].share;
      const allEqual = expense.splits.every(
        (s) => Math.abs(s.share - first) < 0.01
      );
      if (
        allEqual &&
        expense.participantIds &&
        expense.participantIds.length === expense.splits.length
      ) {
        perHead = first;
      } else {
        isCustom = true;
      }
    } else if (expense.participantIds && expense.participantIds.length) {
      const raw = (expense.amount || 0) / expense.participantIds.length;
      perHead = Math.round(raw * 100) / 100;
    }

    return (
      <TouchableOpacity
        key={expense.id}
        style={[
          styles.expenseCard,
          expense.isSettled && { opacity: 0.6 },
        ]}
        onPress={() => startEditExpense(expense)}
        onLongPress={() => handleExpenseLongPress(expense)}
        delayLongPress={300}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.expenseTitle}>{expense.description}</Text>

          {expense.category ? (
            <Text style={styles.expenseMetaSmall}>{expense.category}</Text>
          ) : null}

          <Text style={styles.expenseMeta}>
            Paid by {payerName} • Split between{" "}
            {expense.participantIds?.length || 0} people
          </Text>

          {isCustom ? (
            <Text style={styles.expenseMetaSmall}>Custom split</Text>
          ) : perHead != null ? (
            <Text style={styles.expenseMetaSmall}>
              ≈ ₹ {perHead} per person
            </Text>
          ) : null}

          {expense.isSettled && (
            <Text
              style={[
                styles.expenseMetaSmall,
                { color: "#22C55E", fontWeight: "600" },
              ]}
            >
              Settled
            </Text>
          )}
        </View>
        <Text style={styles.expenseAmount}>₹ {expense.amount}</Text>
      </TouchableOpacity>
    );
  };

  // Outstanding total (unsettled only)
  const groupTotal =
    selectedGroup?.expenses
      ?.filter((e) => !e.isSettled)
      .reduce((sum, e) => sum + e.amount, 0) || 0;

  // ----- Balances (who owes / should receive) -----
  const computeBalances = (group) => {
    if (!group || !group.members || !group.expenses) return [];

    const balancesMap = {};
    group.members.forEach((m) => {
      balancesMap[m.id] = 0;
    });

    (group.expenses || [])
      .filter((expense) => !expense.isSettled)
      .forEach((expense) => {
        const participants = expense.participantIds || [];
        if (!participants.length) return;

        if (expense.splits && expense.splits.length) {
          // use custom/equal splits
          expense.splits.forEach((s) => {
            if (balancesMap[s.memberId] === undefined)
              balancesMap[s.memberId] = 0;
            balancesMap[s.memberId] -= s.share;
          });
        } else {
          // fallback: equal
          const perHead =
            Math.round(
              ((expense.amount || 0) / participants.length) * 100
            ) / 100;
          participants.forEach((memberId) => {
            if (balancesMap[memberId] === undefined)
              balancesMap[memberId] = 0;
            balancesMap[memberId] -= perHead;
          });
        }

        // payer paid full amount
        if (balancesMap[expense.payerId] === undefined) {
          balancesMap[expense.payerId] = 0;
        }
        balancesMap[expense.payerId] += expense.amount;
      });

    // Apply settlements
    (group.settlements || []).forEach((s) => {
      if (balancesMap[s.fromMemberId] === undefined)
        balancesMap[s.fromMemberId] = 0;
      if (balancesMap[s.toMemberId] === undefined)
        balancesMap[s.toMemberId] = 0;

      balancesMap[s.fromMemberId] += s.amount; // debtor paid, so moves towards 0
      balancesMap[s.toMemberId] -= s.amount; // receiver moves towards 0
    });

    const balances = group.members.map((m) => ({
      memberId: m.id,
      name: m.name,
      balance: Math.round((balancesMap[m.id] || 0) * 100) / 100,
    }));

    balances.sort((a, b) => b.balance - a.balance);
    return balances;
  };

  const computeCategoryTotals = (group) => {
    if (!group || !group.expenses) return [];
    const map = {};
    group.expenses.forEach((e) => {
      const key = e.category?.trim() || "Uncategorized";
      map[key] = (map[key] || 0) + (e.amount || 0);
    });
    return Object.entries(map).map(([category, total]) => ({
      category,
      total,
    }));
  };

  const balances = computeBalances(selectedGroup);
  const categoryTotals = computeCategoryTotals(selectedGroup);
  const settlements = selectedGroup?.settlements || [];

  const filteredExpenses = (selectedGroup?.expenses || []).filter((e) => {
    if (categoryFilter !== "all") {
      const catKey = (e.category?.trim() || "Uncategorized").toLowerCase();
      if (catKey !== categoryFilter.toLowerCase()) return false;
    }
    if (expenseSearch.trim()) {
      const q = expenseSearch.trim().toLowerCase();
      const payerName = getMemberName(selectedGroup, e.payerId)
        .toLowerCase();
      const desc = (e.description || "").toLowerCase();
      const cat = (e.category || "").toLowerCase();
      if (
        !desc.includes(q) &&
        !cat.includes(q) &&
        !payerName.includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const openSettleModal = (balanceRow) => {
    if (!selectedGroup) return;
    setSettleFromMember(balanceRow);

    // default "to" member: first with positive balance
    const creditor = balances.find((b) => b.balance > 0.5);
    setSettleToMemberId(creditor ? creditor.memberId : null);

    const defaultAmount = Math.abs(balanceRow.balance);
    setSettleAmount(defaultAmount > 0 ? String(defaultAmount.toFixed(0)) : "");
    setSettleModalVisible(true);
  };

  const handleConfirmSettlement = async () => {
    if (!selectedGroup || !settleFromMember || !settleToMemberId) return;
    const amountNum = parseFloat(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid amount", "Enter a positive amount to settle.");
      return;
    }

    const settlement = {
      id: Date.now().toString(),
      fromMemberId: settleFromMember.memberId,
      toMemberId: settleToMemberId,
      amount: amountNum,
      createdAt: new Date().toISOString(),
    };

    const updatedGroup = {
      ...selectedGroup,
      settlements: [...(selectedGroup.settlements || []), settlement],
    };

    setSelectedGroup(updatedGroup);
    await updateGroupInList(updatedGroup);
    setSettleModalVisible(false);
    setSettleFromMember(null);
    setSettleAmount("");

    trackSettlementCreated(updatedGroup, settlement);
  };

  // ----- Group list item -----
  const renderGroup = ({ item }) => {
    const isActive = item.id === activeGroupId;
    const memberCount = item.members?.length || 0;
    const expenseCount = item.expenses?.length || 0;
    const totalAmount = (item.expenses || []).reduce(
      (sum, e) => sum + e.amount,
      0
    );

    return (
      <TouchableOpacity
        style={[
          styles.groupCard,
          isActive && { borderColor: palette.PRIMARY, borderWidth: 1.5 },
        ]}
        onPress={() => openGroupDetails(item.id)}
        onLongPress={() => handleDeleteGroup(item.id)}
        delayLongPress={400}
      >
        <View style={styles.groupIcon}>
          <Ionicons name="people" size={20} color={palette.TEXT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMeta}>
            {memberCount} member{memberCount === 1 ? "" : "s"} • {expenseCount}{" "}
            expense{expenseCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.groupMetaSmall}>
            Total: ₹ {totalAmount.toFixed(0)} • Created{" "}
            {formatDate(item.createdAt) || "recently"}
          </Text>
        </View>
        {isActive ? (
          <View style={styles.activeBadge}>
            <Ionicons
              name="sparkles-outline"
              size={14}
              color={palette.PRIMARY}
            />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={20} color={palette.MUTED} />
        )}
      </TouchableOpacity>
    );
  };

  // ----- Render -----
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>Groups</Text>
          <Text style={styles.screenSubtitle}>
            Track and split shared expenses
          </Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={styles.infoCard}>
        <Ionicons name="bulb-outline" size={22} color="#FACC15" />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.infoTitle}>Workflow</Text>
          <Text style={styles.infoText}>
            Create a group → add members → log expenses with payer, split mode &
            category. Use Equal or By amount. Long-press an expense to mark as
            paid or delete.
          </Text>
        </View>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your groups</Text>
        <Text style={styles.sectionCount}>{groups.length} total</Text>
      </View>

      {/* Groups list */}
      {groups.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="people-circle-outline"
            size={44}
            color={palette.MUTED}
          />
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap “New group” to start tracking Flatmates, Goa Trip, etc.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={{ paddingBottom: 160 }}
        />
      )}

      {/* FAB: New group */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: palette.PRIMARY }]}
        onPress={handleOpenCreateModal}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>New group</Text>
      </TouchableOpacity>

      {/* Create Group Modal */}
      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCreateModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleCloseCreateModal}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create group</Text>
              <Pressable onPress={handleCloseCreateModal}>
                <Ionicons name="close" size={22} color={palette.MUTED} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Group name</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. Flatmates, Goa Trip, College Fest"
              placeholderTextColor={palette.MUTED}
              style={styles.input}
            />

            <TouchableOpacity
              style={[
                styles.modalButton,
                !groupName.trim() && { opacity: 0.4 },
              ]}
              disabled={!groupName.trim()}
              onPress={handleCreateGroup}
            >
              <Text style={styles.modalButtonText}>Create</Text>
            </TouchableOpacity>

            <Text style={styles.modalHint}>
              Long-press a group in the list to delete it.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Group Details Modal (scrollable) */}
      <Modal
        visible={isDetailsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeGroupDetails}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeGroupDetails}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Header with Active group button */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="people"
                    size={20}
                    color={palette.TEXT}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.modalTitle}>
                    {selectedGroup?.name || "Group"}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {selectedGroup &&
                    (selectedGroup.id === activeGroupId ? (
                      <View
                        style={[
                          styles.activeBadge,
                          { backgroundColor: palette.CARD_ELEVATED },
                        ]}
                      >
                        <Ionicons
                          name="sparkles-outline"
                          size={14}
                          color={palette.PRIMARY}
                        />
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.setActiveButton,
                          { borderColor: palette.PRIMARY },
                        ]}
                        onPress={() => handleSetActiveGroup(selectedGroup.id)}
                      >
                        <Ionicons
                          name="radio-button-on-outline"
                          size={14}
                          color={palette.PRIMARY}
                        />
                        <Text
                          style={[
                            styles.setActiveText,
                            { color: palette.PRIMARY },
                          ]}
                        >
                          Set active
                        </Text>
                      </TouchableOpacity>
                    ))}
                  <Pressable
                    onPress={closeGroupDetails}
                    style={{ marginLeft: 8 }}
                  >
                    <Ionicons name="close" size={22} color={palette.MUTED} />
                  </Pressable>
                </View>
              </View>

              {/* Members section */}
              <Text style={styles.modalLabel}>Members</Text>
              {selectedGroup?.members?.length ? (
                <View style={styles.membersContainer}>
                  {selectedGroup.members.map(renderMemberChip)}
                </View>
              ) : (
                <Text style={styles.membersEmpty}>
                  No members yet. Add your first member below.
                </Text>
              )}

              <Text style={[styles.modalLabel, { marginTop: 12 }]}>
                Add member
              </Text>
              <TextInput
                value={memberName}
                onChangeText={setMemberName}
                placeholder="e.g. You, Vishnu, Arun"
                placeholderTextColor={palette.MUTED}
                style={styles.input}
              />

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  !memberName.trim() && { opacity: 0.4 },
                ]}
                disabled={!memberName.trim()}
                onPress={handleAddMember}
              >
                <Text style={styles.modalButtonText}>Add member</Text>
              </TouchableOpacity>

              {/* Balances section */}
              <View style={styles.balancesHeaderRow}>
                <Text style={[styles.modalLabel, { marginTop: 16 }]}>
                  Balances
                </Text>
                {selectedGroup && (
                  <Text style={styles.expensesSummary}>
                    Outstanding: ₹ {groupTotal.toFixed(0)} •{" "}
                    {selectedGroup.expenses?.filter((e) => !e.isSettled)
                      .length || 0}{" "}
                    open
                  </Text>
                )}
              </View>

              {selectedGroup?.expenses?.length ? (
                balances.length ? (
                  <View style={styles.balancesList}>
                    {balances.map((b) => {
                      let line = "";
                      let color = "#22C55E";

                      if (b.balance > 0) {
                        line = `${b.name} should receive ₹ ${b.balance.toFixed(
                          0
                        )}`;
                        color = "#22C55E";
                      } else if (b.balance < 0) {
                        line = `${b.name} owes ₹ ${Math.abs(
                          b.balance
                        ).toFixed(0)}`;
                        color = "#F97316";
                      } else {
                        line = `${b.name} is settled up`;
                        color = palette.MUTED;
                      }

                      const isCurrentUser =
                        profile?.name?.trim() &&
                        b.name.trim().toLowerCase() ===
                          profile.name.trim().toLowerCase();

                      if (isCurrentUser) {
                        color = "#EAB308"; // amber highlight
                      }

                      return (
                        <View
                          key={b.memberId}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={[
                              styles.balanceText,
                              { color },
                              isCurrentUser && { fontWeight: "700" },
                            ]}
                          >
                            {line}
                          </Text>

                          {isCurrentUser && b.balance < -0.5 && (
                            <TouchableOpacity
                              onPress={() => openSettleModal(b)}
                            >
                              <Text style={styles.settleLinkText}>
                                Settle up
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.membersEmpty}>
                    No balances yet. Add expenses to see who owes what.
                  </Text>
                )
              ) : (
                <Text style={styles.membersEmpty}>
                  No expenses yet. Balances will appear after you add expenses.
                </Text>
              )}

              {/* Settlements history */}
              {settlements.length > 0 && (
                <>
                  <Text style={[styles.modalLabel, { marginTop: 12 }]}>
                    Settlements
                  </Text>
                  <View style={styles.settlementsList}>
                    {settlements.map((s) => {
                      const fromName = getMemberName(
                        selectedGroup,
                        s.fromMemberId
                      );
                      const toName = getMemberName(
                        selectedGroup,
                        s.toMemberId
                      );
                      return (
                        <Text key={s.id} style={styles.settlementText}>
                          {fromName} paid {toName} ₹ {s.amount.toFixed(0)}
                        </Text>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Category analytics + filters */}
              <View style={styles.expensesHeaderRow}>
                <Text style={[styles.modalLabel, { marginTop: 16 }]}>
                  Group expenses
                </Text>
              </View>

              {categoryTotals.length > 0 && (
                <View style={styles.categoryFilterRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    <TouchableOpacity
                      style={[
                        styles.pill,
                        categoryFilter === "all" && styles.pillSelected,
                      ]}
                      onPress={() => setCategoryFilter("all")}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          categoryFilter === "all" &&
                            styles.pillTextSelected,
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>
                    {categoryTotals.map((ct) => (
                      <TouchableOpacity
                        key={ct.category}
                        style={[
                          styles.pill,
                          categoryFilter === ct.category &&
                            styles.pillSelected,
                        ]}
                        onPress={() => setCategoryFilter(ct.category)}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            categoryFilter === ct.category &&
                              styles.pillTextSelected,
                          ]}
                        >
                          {ct.category} (₹ {ct.total.toFixed(0)})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Search bar */}
              <TextInput
                value={expenseSearch}
                onChangeText={setExpenseSearch}
                placeholder="Search by description, category or payer"
                placeholderTextColor={palette.MUTED}
                style={[styles.input, { marginTop: 6 }]}
              />

              {editingExpenseId && (
                <View style={styles.editingBanner}>
                  <Text style={styles.editingBannerText}>
                    Editing expense – tap “Cancel” to stop editing.
                  </Text>
                  <TouchableOpacity
                    onPress={() => resetExpenseForm(selectedGroup)}
                  >
                    <Text style={styles.editingBannerLink}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedGroup?.expenses?.length ? (
                filteredExpenses.length ? (
                  <View style={styles.expensesList}>
                    {filteredExpenses.map(renderExpenseRow)}
                  </View>
                ) : (
                  <Text style={styles.membersEmpty}>
                    No expenses match your search/filter.
                  </Text>
                )
              ) : (
                <Text style={styles.membersEmpty}>
                  No expenses yet. Add the first shared expense below.
                </Text>
              )}

              {/* Add expense form */}
              <Text style={[styles.modalLabel, { marginTop: 16 }]}>
                {editingExpenseId ? "Edit expense" : "Add expense"}
              </Text>
              <TextInput
                value={expenseDesc}
                onChangeText={setExpenseDesc}
                placeholder="Description (e.g. Dinner, Cab, Rent)"
                placeholderTextColor={palette.MUTED}
                style={styles.input}
              />
              <TextInput
                value={expenseCategory}
                onChangeText={setExpenseCategory}
                placeholder="Category (e.g. Food, Travel, Bills)"
                placeholderTextColor={palette.MUTED}
                style={[styles.input, { marginTop: 8 }]}
              />
              <TextInput
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder="Amount (₹)"
                placeholderTextColor={palette.MUTED}
                keyboardType="numeric"
                style={[styles.input, { marginTop: 8 }]}
              />

              {/* Split mode */}
              <Text style={[styles.modalLabel, { marginTop: 10 }]}>
                Split mode
              </Text>
              <View style={styles.payerRow}>
                <TouchableOpacity
                  style={[
                    styles.pill,
                    splitMode === "equal" && styles.pillSelected,
                  ]}
                  onPress={() => setSplitMode("equal")}
                >
                  <Text
                    style={[
                      styles.pillText,
                      splitMode === "equal" && styles.pillTextSelected,
                    ]}
                  >
                    Equal
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pill,
                    splitMode === "custom" && styles.pillSelected,
                  ]}
                  onPress={() => setSplitMode("custom")}
                >
                  <Text
                    style={[
                      styles.pillText,
                      splitMode === "custom" && styles.pillTextSelected,
                    ]}
                  >
                    By amount
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Custom amount rows */}
              {splitMode === "custom" && selectedParticipantIds.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {selectedParticipantIds.map((id) => {
                    const memberName = getMemberName(selectedGroup, id);
                    return (
                      <View key={id} style={styles.customShareRow}>
                        <Text style={styles.customShareName}>{memberName}</Text>
                        <TextInput
                          style={styles.customShareInput}
                          value={customShares[id] || ""}
                          onChangeText={(val) =>
                            handleCustomShareChange(id, val)
                          }
                          placeholder="₹"
                          placeholderTextColor={palette.MUTED}
                          keyboardType="numeric"
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Paid by */}
              <Text style={[styles.modalLabel, { marginTop: 10 }]}>
                Paid by
              </Text>
              <View style={styles.payerRow}>
                {selectedGroup?.members?.length ? (
                  selectedGroup.members.map((m) => {
                    const isSelected = payerId === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.pill,
                          isSelected && {
                            backgroundColor: palette.PRIMARY,
                            borderColor: palette.PRIMARY,
                          },
                        ]}
                        onPress={() => setPayerId(m.id)}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            isSelected && {
                              color: "#FFFFFF",
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.membersEmpty}>
                    Add at least one member to select a payer.
                  </Text>
                )}
              </View>

              {/* Split between */}
              <Text style={[styles.modalLabel, { marginTop: 10 }]}>
                Split between
              </Text>
              <View style={styles.payerRow}>
                {selectedGroup?.members?.length ? (
                  selectedGroup.members.map((m) => {
                    const isSelected = selectedParticipantIds.includes(m.id);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.pill,
                          isSelected && {
                            backgroundColor: palette.PRIMARY,
                            borderColor: palette.PRIMARY,
                          },
                        ]}
                        onPress={() => toggleParticipant(m.id)}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            isSelected && {
                              color: "#FFFFFF",
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.membersEmpty}>
                    Add members to split the expense.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  (!expenseDesc.trim() ||
                    !expenseAmount.trim() ||
                    !payerId ||
                    (selectedGroup?.members?.length || 0) === 0) && {
                    opacity: 0.4,
                  },
                ]}
                disabled={
                  !expenseDesc.trim() ||
                  !expenseAmount.trim() ||
                  !payerId ||
                  (selectedGroup?.members?.length || 0) === 0
                }
                onPress={handleSubmitExpense}
              >
                <Text style={styles.modalButtonText}>
                  {editingExpenseId ? "Update expense" : "Add expense"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.modalHint}>
                Equal split: amount ÷ selected participants. By amount: you
                choose each share; it must total the full amount. Tap an expense
                to edit, or long-press to mark as paid or delete it.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit member modal */}
      <Modal
        visible={editMemberModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditMemberModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditMemberModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit member</Text>
              <Pressable onPress={() => setEditMemberModalVisible(false)}>
                <Ionicons name="close" size={22} color={palette.MUTED} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              value={memberEditName}
              onChangeText={setMemberEditName}
              placeholder="Member name"
              placeholderTextColor={palette.MUTED}
              style={styles.input}
            />

            <TouchableOpacity
              style={[
                styles.modalButton,
                !memberEditName.trim() && { opacity: 0.4 },
              ]}
              disabled={!memberEditName.trim()}
              onPress={handleSaveMemberEdit}
            >
              <Text style={styles.modalButtonText}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settle up modal */}
      <Modal
        visible={settleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSettleModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settle up</Text>
              <Pressable onPress={() => setSettleModalVisible(false)}>
                <Ionicons name="close" size={22} color={palette.MUTED} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>
              {settleFromMember
                ? `${settleFromMember.name} pays`
                : "Payer"}
            </Text>

            <Text style={styles.modalLabel}>To</Text>
            <View style={styles.payerRow}>
              {selectedGroup?.members
                ?.filter((m) => m.id !== (settleFromMember?.memberId || ""))
                .map((m) => {
                  const isSelected = settleToMemberId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.pill,
                        isSelected && styles.pillSelected,
                      ]}
                      onPress={() => setSettleToMemberId(m.id)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          isSelected && styles.pillTextSelected,
                        ]}
                      >
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>

            <Text style={styles.modalLabel}>Amount (₹)</Text>
            <TextInput
              value={settleAmount}
              onChangeText={setSettleAmount}
              placeholder="Enter amount"
              placeholderTextColor={palette.MUTED}
              keyboardType="numeric"
              style={styles.input}
            />

            <TouchableOpacity
              style={[
                styles.modalButton,
                (!settleFromMember ||
                  !settleToMemberId ||
                  !settleAmount.trim()) && {
                  opacity: 0.4,
                },
              ]}
              disabled={
                !settleFromMember ||
                !settleToMemberId ||
                !settleAmount.trim()
              }
              onPress={handleConfirmSettlement}
            >
              <Text style={styles.modalButtonText}>Confirm</Text>
            </TouchableOpacity>

            <Text style={styles.modalHint}>
              Settlements adjust balances without changing past expenses. Use
              this after someone pays back what they owe.
            </Text>
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
    infoCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 18,
      padding: 12,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
      marginBottom: 16,
    },
    infoTitle: {
      color: p.TEXT,
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 2,
    },
    infoText: {
      color: p.MUTED,
      fontSize: 12,
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
    sectionCount: {
      color: p.MUTED,
      fontSize: 12,
    },
    groupCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: p.BORDER || "#111827",
    },
    groupIcon: {
      width: 38,
      height: 38,
      borderRadius: 999,
      backgroundColor: p.BORDER || "#111827",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    groupName: {
      color: p.TEXT,
      fontSize: 15,
      fontWeight: "600",
    },
    groupMeta: {
      color: p.MUTED,
      fontSize: 12,
      marginTop: 2,
    },
    groupMetaSmall: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 2,
    },
    activeBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    activeBadgeText: {
      color: p.PRIMARY,
      fontSize: 11,
      marginLeft: 4,
      fontWeight: "600",
    },
    setActiveButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
    },
    setActiveText: {
      color: p.PRIMARY,
      fontSize: 11,
      marginLeft: 4,
      fontWeight: "600",
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
      bottom: 90,
      flexDirection: "row",
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      alignItems: "center",
      elevation: 3,
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
      maxHeight: "90%",
    },
    modalScrollContent: {
      paddingBottom: 16,
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
      marginTop: 8,
    },
    modalButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
    },
    modalHint: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 8,
      textAlign: "center",
    },
    membersContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 4,
    },
    membersEmpty: {
      color: p.MUTED,
      fontSize: 12,
      marginBottom: 4,
    },
    memberChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
      marginRight: 6,
      marginBottom: 6,
    },
    memberAvatar: {
      width: 22,
      height: 22,
      borderRadius: 999,
      backgroundColor: p.BORDER || "#111827",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 6,
    },
    memberAvatarText: {
      color: p.TEXT,
      fontSize: 11,
      fontWeight: "700",
    },
    memberName: {
      color: p.TEXT,
      fontSize: 13,
    },
    balancesHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    balancesList: {
      marginTop: 4,
    },
    balanceText: {
      fontSize: 12,
      fontWeight: "600",
    },
    settleLinkText: {
      color: p.PRIMARY,
      fontSize: 11,
      marginLeft: 8,
      fontWeight: "600",
    },
    expensesHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    expensesSummary: {
      color: p.MUTED,
      fontSize: 11,
    },
    expensesList: {
      marginTop: 4,
    },
    expenseCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.CARD,
      borderRadius: 14,
      padding: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: p.BORDER || "#111827",
    },
    expenseTitle: {
      color: p.TEXT,
      fontSize: 14,
      fontWeight: "600",
    },
    expenseMeta: {
      color: p.MUTED,
      fontSize: 12,
      marginTop: 2,
    },
    expenseMetaSmall: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 2,
    },
    expenseAmount: {
      color: "#F97316",
      fontSize: 15,
      fontWeight: "700",
      marginLeft: 10,
    },
    payerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 4,
    },
    pill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
      backgroundColor: p.CARD,
      marginRight: 6,
      marginBottom: 6,
    },
    pillSelected: {
      backgroundColor: p.PRIMARY,
      borderColor: p.PRIMARY,
    },
    pillText: {
      color: p.MUTED,
      fontSize: 12,
    },
    pillTextSelected: {
      color: "#FFFFFF",
      fontWeight: "600",
    },
    customShareRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    customShareName: {
      color: p.TEXT,
      fontSize: 13,
      flex: 1,
      marginRight: 8,
    },
    customShareInput: {
      width: 90,
      backgroundColor: p.CARD,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
      paddingHorizontal: 10,
      paddingVertical: 6,
      color: p.TEXT,
      fontSize: 13,
      textAlign: "right",
    },
    settlementsList: {
      marginTop: 4,
    },
    settlementText: {
      color: p.MUTED,
      fontSize: 11,
      marginTop: 2,
    },
    editingBanner: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: p.CARD_ELEVATED,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 6,
      borderWidth: 1,
      borderColor: p.BORDER || "#1F2937",
    },
    editingBannerText: {
      color: p.MUTED,
      fontSize: 12,
    },
    editingBannerLink: {
      color: p.PRIMARY,
      fontSize: 12,
      fontWeight: "600",
    },
    categoryFilterRow: {
      marginTop: 6,
      marginBottom: 4,
    },
  });
}
