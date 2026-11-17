# Buying authorization

> **DRAFT. Not legal advice. Not reviewed by a lawyer. Feature not built.** Lane 10, November 17, 2026.
> For lane 08: this is what an owner agrees to when they save a buying policy in the Portal. It covers Stage 1 only: orders on supplier accounts the business already has, with payment already on file there. Pip handles no card and no money.

## What the owner sees and agrees to

**You are letting {teammate} place orders for {business}.**

Here is the policy you set. {teammate} cannot order anything outside it.

| | |
| --- | --- |
| Suppliers | {list} |
| Items, with reorder point and quantity | {list} |
| Most per order | ${amount} |
| Most per month | ${amount} |
| If an order would go over a limit | It is held and you are told. Nothing is ordered. |

By saving this policy, you agree:

1. **You are the buyer.** Every order {teammate} places inside this policy is your order, placed by you through software you chose, on your account with the supplier, paid with the payment method you keep on file there. Pip is not the buyer or the seller and never holds your money.
2. **No approval each time.** {teammate} orders on its own when an item reaches its reorder point. You will not be asked first. You will see every order in your Portal with the numbers that were checked.
3. **The limits are enforced by software, not by the AI.** Before any order, Pip's software checks the supplier, the items, the order total and your month so far against this policy. An order that fails any check is not placed.
4. **Inside the policy is yours.** If an order is inside this policy, it is yours even if you would have chosen differently that day. Change the policy any time; changes apply to the next order.
5. **Outside the policy is ours.** If an order is placed outside this policy because of a fault in Pip's software, tell us within [30] days and Pip will make it right as the Terms of Service say. [LAWYER: define "make it right": cost of return shipping and restocking, or the order value, subject to the cap?]
6. **Your supplier's rules still apply.** Prices, delivery, returns and disputes are between you and your supplier. {teammate} reports price changes, out-of-stock items and problems to you. It does not negotiate, accept new terms, open new accounts, add payment methods or handle returns.
7. **You are allowed to do this.** You confirm your agreement with each supplier lets you use software or a service provider to order on your account.
8. **Some things are never ordered:** alcohol, tobacco and vaping products, cannabis, firearms, prescription drugs, or anything that needs an age or license check at purchase.
9. **You can stop it at once.** Turn purchasing off in the Portal and no further orders are placed. Orders already placed stand.

☐ I am authorized to buy for {business} and I agree.

Name · Email · Date and time · Policy version

## What is recorded

For lane 08: store the full policy as agreed, the wording version, who agreed, when, and from which signed-in account, in `business_agreements` (a new kind, `buying_authorization`) and a line in `compliance_events`. Every change to the limits needs a fresh agreement and a fresh sign-in. Every order logs the policy version and the numbers checked.

## Open points for the lawyer (memo item 8)

- Does item 1 make the business the buyer as against the supplier, when the order is formed by an electronic agent [S18]?
- Who bears a correct-by-policy order made on bad data, such as a wrong stock count from the business's own system?
- Is item 7 enough where a supplier's terms forbid automated ordering [S13]?
- Sales tax and resale certificates: any duty on Pip?
