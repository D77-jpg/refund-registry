/**
 * 全局领域类型定义。
 *
 * 设计说明：
 * - 用户端只提交「事实信息」，不自行决定退款结果；状态流转完全由管理后台控制。
 * - order_no 唯一（大小写归一后），实现「同一订单号只能登记一次」。
 */

/** 退款工单状态 */
export type RefundStatus =
  /** 已提交，等待人工核实（对应人工退款表里的「待人工退款」） */
  | 'pending'
  /** 核实通过并已打款（对应「已退款」） */
  | 'refunded'
  /** 核实不通过（订单号/卡密对不上、非本人订单、超期等） */
  | 'rejected';

/** 兑换码当前状态（用户自报，对应人工退款表里的「兑换码当前状态」） */
export type RedeemState =
  /** 未通过（认证/兑换失败） */
  | 'not_passed'
  /** 处理中 */
  | 'processing'
  /** 已停用 / 禁止后续提交 */
  | 'disabled'
  /** 已成功使用（按规则可能不支持退款，需人工判断） */
  | 'used'
  /** 不清楚 */
  | 'unknown';

/** 退款原因分类 */
export type RefundReasonCode =
  /** 无法正常获取学生认证 */
  | 'student_auth_failed'
  /** 卡密已被使用 / 提示重复兑换 */
  | 'code_already_used'
  /** 重复下单 / 买错商品 */
  | 'duplicate_or_wrong'
  /** 商品与描述不符（时长、权益不一致） */
  | 'not_as_described'
  /** 其他（需填写说明） */
  | 'other';

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending: '待人工退款',
  refunded: '已退款',
  rejected: '已驳回'
};

export const REDEEM_STATE_LABEL: Record<RedeemState, string> = {
  not_passed: '未通过',
  processing: '处理中',
  disabled: '已停用',
  used: '已使用',
  unknown: '不清楚'
};

export const REASON_LABEL: Record<RefundReasonCode, string> = {
  student_auth_failed: '无法正常获取学生认证',
  code_already_used: '卡密提示已被使用',
  duplicate_or_wrong: '重复下单 / 买错商品',
  not_as_described: '商品与描述不符',
  other: '其他原因'
};

/** 一条退款登记记录 */
export interface RefundRow {
  id: number;
  order_no: string;
  redeem_code: string;
  contact: string;
  contact_type: string;
  contact_name: string;
  amount: string;
  reason_code: string;
  redeem_state: string;
  description: string;
  receipt_mime: string;
  receipt_data: string;
  status: RefundStatus;
  admin_note: string;
  refund_ref: string;
  ip: string;
  user_agent: string;
  created_at: string;
  updated_at: string;
  refunded_at: string | null;
}

/** 用户端可提交的字段 */
export interface RefundInput {
  order_no: string;
  redeem_code: string;
  contact: string;
  contact_type: string;
  contact_name: string;
  amount: string;
  reason_code: string;
  redeem_state: string;
  description: string;
  receipt: string;
}
