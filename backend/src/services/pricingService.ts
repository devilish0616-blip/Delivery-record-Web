// 每月收入單價：稅前 -> 稅後 固定換算公式
// 正物流稅後單價 = 稅前 * 0.91 + 稅前 * 0.05 = 稅前 * 0.96
// 逆物流稅後單價 = 稅前 * 0.96
export const AFTER_TAX_RATE = 0.96;

export function toAfterTaxPrice(beforeTax: number): number {
  return beforeTax * AFTER_TAX_RATE;
}

export function withAfterTaxPricing<
  T extends { forwardPriceBeforeTax: number; reversePriceBeforeTax: number }
>(pricing: T) {
  return {
    ...pricing,
    forwardPriceAfterTax: toAfterTaxPrice(pricing.forwardPriceBeforeTax),
    reversePriceAfterTax: toAfterTaxPrice(pricing.reversePriceBeforeTax),
  };
}
