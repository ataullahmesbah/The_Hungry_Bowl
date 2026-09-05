# Audit guide — where everything is, and how to check it

For an auditor, or a store / warehouse / kitchen manager who has to answer
"how much should be here, and does it match?"

> বাংলা: অডিট টিম বা স্টোর/গুদাম/কিচেন ম্যানেজার — কোথায় কী আছে, কত থাকার
> কথা, আর মিলছে কিনা — সব এই ফাইলে।

---

## 1. The rule the whole system is built on

**Nothing is edited. Everything is added.**

Stock and audit records are append-only ledgers. A quantity is never
overwritten; a correcting entry is added beside the original, with a reason and
the name of whoever made it. So the question "was this changed later?" always
has an answer, and the answer is always visible.

- `StockMovement` — every gram that moves. Balances are **derived** from it.
- `AuditLog` — every sensitive action. There is **no API route** that edits or
  deletes it. Not "an admin shouldn't" — the code path does not exist.

## 2. The four screens an audit starts from

| Screen | Question it answers |
|---|---|
| **Inventory → Stock ledger** | Per store, per item, for any date range: opening, in, out, closing. **This is the main audit screen.** |
| **Inventory → Stock movements** | The raw line-by-line record behind those totals |
| **Finance → Daily closing** | Sales counted independently of payments collected, with the variance shown |
| **Audit log** | Who did what, when, from which IP, at what severity |

## 3. Reading the stock ledger

`/dashboard/inventory/ledger` — pick a date range and, optionally, one store.
**Every store is reported separately**, because a warehouse and a kitchen are
different physical places; merging them hides the very gap an audit looks for.

Each row reads left to right as an equation:

```
Opening + Purchased + Transfer in + Returned in
        − Transfer out − Used − Wastage − Returned out
        ± Count adjustment
        = Closing
```

Worked example — 10 kg of chicken bought, 8 kg sent to the kitchen, 7.5 kg
cooked, 0.5 kg sent back:

| Store | Opening | In | Out | Closing |
|---|---|---|---|---|
| **Main Warehouse** | 0 | 10 purchased, 0.5 returned in | 8 transfer out | **2.5 kg** |
| **Kitchen Store** | 0 | 8 transfer in | 7.5 used, 0.5 returned out | **0 kg** |

2.5 + 0 = 10 − 7.5. The two stores are counted apart, and together they still
account for every gram.

**Opening is not stored anywhere — it is derived**, by winding today's balance
backwards through the movements since that date. Because movements can only be
added, a past day's opening figure cannot be quietly rewritten to make the
books balance.

## 4. When the shelf disagrees with the screen

Do **not** correct the number by editing it — there is no way to, by design.

Record a **Stock count** on the Inventory page: enter what you actually
counted. The system works out the difference itself and writes it to the ledger
as a **Count adjustment**, with a mandatory reason and your name. The
discrepancy stays visible forever, which is the point.

Spoiled or dropped stock is **Wastage**, not a count adjustment — keep the two
apart so "we lost it" and "it went bad" never blur together in the reports.

## 5. Cross-checks an auditor can run

| Check | How |
|---|---|
| Does the money add up? | **Finance → Daily closing**: completed-order totals and recorded payments are computed **independently**, and the variance is reported, never absorbed |
| Did stock leave without a sale? | Stock ledger **Used** column vs **Reports → Sales** for the same dates |
| Was a bill written off? | **Audit log**, severity HIGH — discounts, refunds, voids and forced session closes are each logged |
| Did someone force a table closed with an unpaid bill? | **Audit log**, action `session.closed_forced` — logged HIGH and pushed to finance as CRITICAL at the time |
| Is a purchase real? | **Purchases** → supplier, quantities received, and the matching `PURCHASE_RECEIVE` rows in the ledger |
| Who served what? | **Reports → Staff** — orders, sales and average bill per person, recorded automatically from the login that created each order |

## 6. Read-only access for the audit team

Give auditors their own accounts — never a shared login, or the audit trail
loses its value.

**Users → Roles → New role**, then tick view permissions only:

```
dashboard.view      inventory.view    purchasing.view
orders.view         recipes.view      reports.sales
payments.view       finance.view      reports.inventory
customers.view      audit.view        reports.finance
```

Grant no `.manage`, `.adjust`, `.wastage` or `.record` permission. They can then
read every figure and every log, and change nothing.

## 7. What the system will not let anyone do

- Complete an order that still has money outstanding
- Take a payment on a bill that is already settled, or more than the amount due
- Close a table session while its orders are unpaid or still in the kitchen
  (a manager may override — logged HIGH, and finance is notified CRITICAL)
- Delete a table that has guests seated
- Edit or delete an audit log entry, or a stock movement
- Set a price from the browser — every price is read from the database on the
  server when the order is priced
