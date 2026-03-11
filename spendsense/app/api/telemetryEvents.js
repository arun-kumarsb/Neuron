// app/api/telemetryEvents.js
import { sendTelemetry } from "./telemetry";



export const trackScreen = (screen) =>
  sendTelemetry("screen_view", { screen });



export const trackPersonalExpenseCreated = (expense) =>
  sendTelemetry("personal_expense_created", {
    expense: {
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      category: expense.category || null,
      date: expense.date,
    },
  });

export const trackPersonalExpenseUpdated = (expense) =>
  sendTelemetry("personal_expense_updated", {
    expense: {
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      category: expense.category || null,
      date: expense.date,
    },
  });

export const trackPersonalExpenseDeleted = (expense) =>
  sendTelemetry("personal_expense_deleted", {
    expense: {
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      category: expense.category || null,
      date: expense.date,
    },
  });

export const trackPersonalStatsOpened = (monthLabel) =>
  sendTelemetry("personal_stats_opened", {
    month: monthLabel,
  });



function serializeGroup(group) {
  if (!group) return null;
  return {
    id: group.id,
    name: group.name,
    memberCount: group.members?.length || 0,
    expenseCount: group.expenses?.length || 0,
  };
}


export const trackGroupCreated = (group) =>
  sendTelemetry("group_created", { group: serializeGroup(group) });

export const trackGroupDeleted = (group) =>
  sendTelemetry("group_deleted", { group: serializeGroup(group) });

export const trackGroupOpened = (group) =>
  sendTelemetry("group_opened", { group: serializeGroup(group) });

export const trackActiveGroupChanged = (groupId) =>
  sendTelemetry("group_set_active", { groupId });

export const trackMemberAdded = (group, member) =>
  sendTelemetry("group_member_added", {
    group: serializeGroup(group),
    member: { id: member.id, name: member.name },
  });

export const trackMemberRemoved = (group, member) =>
  sendTelemetry("group_member_removed", {
    group: serializeGroup(group),
    member: { id: member.id, name: member.name },
  });

export const trackMemberEdited = (group, before, afterName) =>
  sendTelemetry("group_member_renamed", {
    group: serializeGroup(group),
    from: { id: before.id, oldName: before.name },
    to: { newName: afterName },
  });

export const trackExpenseCreated = (group, expense) =>
  sendTelemetry("group_expense_created", {
    group: serializeGroup(group),
    expense: {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      category: expense.category || null,
    },
  });

export const trackExpenseUpdated = (group, expense) =>
  sendTelemetry("group_expense_updated", {
    group: serializeGroup(group),
    expense: {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      category: expense.category || null,
    },
  });

export const trackExpenseDeleted = (group, expense) =>
  sendTelemetry("group_expense_deleted", {
    group: serializeGroup(group),
    expense: {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      category: expense.category || null,
    },
  });

export const trackExpenseSettled = (group, expense) =>
  sendTelemetry("group_expense_settled_toggled", {
    group: serializeGroup(group),
    expense: {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      isSettled: !!expense.isSettled,
    },
  });

export const trackSettlementCreated = (group, settlement) =>
  sendTelemetry("group_settlement_created", {
    group: serializeGroup(group),
    settlement: {
      id: settlement.id,
      amount: settlement.amount,
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
    },
  });


export const trackSettingsStatsOpened = () =>
  sendTelemetry("settings_stats_opened", {});

export const trackDataExported = () =>
  sendTelemetry("data_exported", {});

export const trackDataReset = () =>
  sendTelemetry("data_reset", {});

export const trackProfileUpdated = (profile) =>
  sendTelemetry("profile_updated", {
    profile: {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
    },
  });
