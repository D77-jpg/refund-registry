'use client';

/** 前端展示用的枚举文案（与 lib/types.ts 保持一致，但可在客户端组件里直接引用） */
export const REASON_LABEL = {
  student_auth_failed: '无法正常获取学生认证',
  code_already_used: '卡密提示已被使用',
  duplicate_or_wrong: '重复下单 / 买错商品',
  not_as_described: '商品与描述不符',
  other: '其他原因'
} as const;

export type ReasonCode = keyof typeof REASON_LABEL;

export const REDEEM_STATE_LABEL = {
  not_passed: '未通过',
  processing: '处理中',
  disabled: '已停用 / 禁止后续提交',
  used: '已成功使用',
  unknown: '不清楚'
} as const;

export type RedeemState = keyof typeof REDEEM_STATE_LABEL;

/** 工单状态展示元数据：徽章配色 + 圆点色，供列表与详情共用 */
export const STATUS_META = {
  pending: {
    label: '待人工退款',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500'
  },
  refunded: {
    label: '已退款',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500'
  },
  rejected: {
    label: '已驳回',
    cls: 'bg-rose-50 text-rose-700 border border-rose-200',
    dot: 'bg-rose-500'
  }
} as const;

export type StatusKey = keyof typeof STATUS_META;
