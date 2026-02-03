
import { useState } from "react";

// ─── BRAND THEME ENGINE (Canva-like brand identity) ──────────────
const THEMES = {
  bloom: {
    name: "Bloom Organics",
    primary: "#2D6A4F",
    secondary: "#40916C",
    accent: "#B7E4C7",
    light: "#F0FAF4",
    text: "#1B4332",
    muted: "#52796F",
    gradient: "linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)",
    logo: "🌿",
    tagline: "Pure. Natural. Nourishing.",
    pattern: "radial-gradient(circle at 20% 50%, rgba(45,106,79,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(64,145,108,0.04) 0%, transparent 50%)",
  },
  luxe: {
    name: "MAISON ÉLITE",
    primary: "#1A1A2E",
    secondary: "#C9A227",
    accent: "#F5E6C8",
    light: "#FAFAF8",
    text: "#1A1A2E",
    muted: "#6B6B7B",
    gradient: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)",
    logo: "◆",
    tagline: "Luxury redefined.",
    pattern: "repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,162,39,0.03) 40px, rgba(201,162,39,0.03) 80px)",
  },
  spark: {
    name: "SparkTech",
    primary: "#6366F1",
    secondary: "#8B5CF6",
    accent: "#C4B5FD",
    light: "#F5F3FF",
    text: "#312E81",
    muted: "#7C3AED",
    gradient: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
    logo: "⚡",
    tagline: "Power your workflow.",
    pattern: "radial-gradient(circle at 90% 80%, rgba(99,102,241,0.08) 0%, transparent 40%), radial-gradient(circle at 10% 10%, rgba(139,92,246,0.05) 0%, transparent 50%)",
  },
};

// ─── MOCK DATA ────────────────────────────────────────────────────
const INVOICE_ITEMS = [
  { id: 1, name: "Organic Matcha Powder", sku: "ORG-MAT-001", qty: 2, price: 34.99, img: "🍵", category: "Beverages" },
  { id: 2, name: "Cold Pressed Coconut Oil", sku: "ORG-COC-003", qty: 1, price: 28.50, img: "🥥", category: "Oils" },
  { id: 3, name: "Almond Butter (Unsalted)", sku: "ORG-ALM-007", qty: 3, price: 12.99, img: "🥜", category: "Spreads" },
];

const RECOMMENDATIONS = [
  { id: 101, name: "Ceremonial Grade Matcha Kit", price: 54.99, img: "🎌", reason: "Pairs perfectly with your Matcha Powder", match: 94, badge: "Best Match", sales: "+340% this month" },
  { id: 102, name: "MCT Oil Drops", price: 22.99, img: "💧", reason: "Customers who buy Coconut Oil love this", match: 88, badge: "Trending", sales: "Reorder #1 item" },
  { id: 103, name: "Organic Honey (Raw)", price: 18.99, img: "🍯", reason: "Enhances your Almond Butter smoothies", match: 81, badge: "New", sales: "4.9 ★ rated" },
  { id: 104, name: "Bamboo Reusable Cups", price: 16.99, img: "🎋", reason: "Complete your matcha ritual sustainably", match: 76, badge: "Eco Pick", sales: "Save the planet" },
];

const TUTORIALS = [
  { id: 1, title: "Perfect Matcha Latte", duration: "3 min", type: "recipe", thumb: "🍵", steps: ["Heat milk to 70°C", "Whisk 1 tsp matcha", "Combine & pour"], forProduct: "Matcha Powder" },
  { id: 2, title: "Deep Hair Mask with Coconut Oil", duration: "5 min", type: "tutorial", thumb: "💆", steps: ["Warm oil gently", "Apply to roots", "Leave 30 min, rinse"], forProduct: "Coconut Oil" },
  { id: 3, title: "Power Bowl Recipe", duration: "8 min", type: "recipe", thumb: "🥗", steps: ["Toast almonds", "Blend almond butter", "Assemble bowl"], forProduct: "Almond Butter" },
];

// ─── MINI MARKETING NURTURE COPY ─────────────────────────────────
const NURTURE_MESSAGES = [
  { icon: "🔥", headline: "Your ritual awaits.", body: "87% of matcha lovers upgrade to ceremonial grade within 30 days. Don't miss out on the experience." },
  { icon: "💡", headline: "Smart combo detected.", body: "This bundle saves you 18% and ships free. Limited offer — expires when your next order ships." },
  { icon: "⭐", headline: "Join 12,400 happy customers.", body: "\"The MCT drops transformed my morning routine.\" — Sarah K., verified buyer" },
];

// ─────────────────────────────────────────────────────────────────
export default function SmartInvoice() {
  const [theme, setTheme] = useState("bloom");
  const [addedItems, setAddedItems] = useState([]);
  const [expandedTutorial, setExpandedTutorial] = useState(null);
  const [nurtureMsgIdx, setNurtureMsgIdx] = useState(0);
  const T = THEMES[theme];

  const subtotal = INVOICE_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const addedTotal = addedItems.reduce((s, id) => {
    const p = RECOMMENDATIONS.find((r) => r.id === id);
    return s + (p ? p.price : 0);
  }, 0);
  const tax = (subtotal + addedTotal) * 0.08;
  const total = subtotal + addedTotal + tax;

  const toggleAdd = (id) =>
    setAddedItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Cycle nurture message
  const cycleNurture = () => setNurtureMsgIdx((i) => (i + 1) % NURTURE_MESSAGES.length);

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'Georgia', serif", position: "relative", overflow: "hidden" }}>
      {/* Background Pattern */}
      <div style={{ position: "fixed", inset: 0, background: T.pattern, pointerEvents: "none", zIndex: 0 }} />

      {/* Theme Switcher */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 8, padding: "16px 24px", background: "#fff", borderBottom: "1px solid #E5E7EB", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginRight: 8 }}>Brand Theme</span>
        {Object.keys(THEMES).map((k) => (
          <button
            key={k}
            onClick={() => setTheme(k)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: theme === k ? `2px solid ${THEMES[k].primary}` : "2px solid #E5E7EB",
              background: theme === k ? THEMES[k].light : "#fff",
              color: THEMES[k].primary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "all 0.2s",
            }}
          >
            <span>{THEMES[k].logo}</span> {THEMES[k].name}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>← Canva-style brand theming</span>
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 780, margin: "0 auto", padding: "24px 16px 48px" }}>
        {/* ── INVOICE CARD ── */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 32px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          {/* Header Banner */}
          <div style={{ background: T.gradient, padding: "28px 32px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
            <div style={{ position: "absolute", bottom: -20, left: 60, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 28 }}>{T.logo}</span>
                  <div>
                    <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{T.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase" }}>{T.tagline}</div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5 }}>Invoice</div>
                <div style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>#INV-2025-0847</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10.5, marginTop: 2 }}>Feb 1, 2025</div>
              </div>
            </div>
          </div>

          {/* Customer + Status Row */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid #F3F4F6", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Sarah Mitchell</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>sarah.mitchell@email.com</div>
              <div style={{ fontSize: 11, color: "#6B7280" }}>Member since 2023 · 14 orders</div>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Status</div>
                <span style={{ background: T.accent, color: T.primary, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>Paid ✓</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Loyalty</div>
                <span style={{ background: "#FEF3C7", color: "#D97706", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>★ Gold</span>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ padding: "0 32px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.accent}` }}>
                  {["", "Product", "SKU", "Qty", "Unit", "Total"].map((h) => (
                    <th key={h} style={{ fontSize: 9.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, padding: "12px 0", textAlign: h === "Total" || h === "Qty" || h === "Unit" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INVOICE_ITEMS.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "14px 0", width: 36 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{item.img}</div>
                    </td>
                    <td style={{ padding: "14px 0" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{item.category}</div>
                    </td>
                    <td style={{ fontSize: 11, color: "#9CA3AF", padding: "14px 0" }}>{item.sku}</td>
                    <td style={{ fontSize: 13, color: T.text, textAlign: "right", padding: "14px 0" }}>{item.qty}</td>
                    <td style={{ fontSize: 13, color: "#6B7280", textAlign: "right", padding: "14px 0" }}>${item.price.toFixed(2)}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: T.text, textAlign: "right", padding: "14px 0" }}>${(item.price * item.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Added-to-order items (from upsells) */}
          {addedItems.length > 0 && (
            <div style={{ margin: "0 32px", background: T.light, borderRadius: 10, padding: "12px 16px", marginTop: 8 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: T.secondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>⚡ Added to Order</div>
              {addedItems.map((id) => {
                const p = RECOMMENDATIONS.find((r) => r.id === id);
                return p ? (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 12, color: T.text }}>{p.img} {p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.primary }}>${p.price.toFixed(2)}</span>
                      <button onClick={() => toggleAdd(id)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          )}

          {/* Totals */}
          <div style={{ padding: "20px 32px 24px", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: 240 }}>
              {[
                ["Subtotal", subtotal],
                ["Tax (8%)", tax],
                [addedTotal > 0 && "Upsell Add-ons", addedTotal],
              ]
                .filter(Boolean)
                .map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", padding: "3px 0" }}>
                    <span>{label}</span>
                    <span>${val.toFixed(2)}</span>
                  </div>
                ))}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${T.accent}`, marginTop: 8, paddingTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.primary }}>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            MINI MARKETING NURTURE BANNER
        ══════════════════════════════════════════════════════════ */}
        <div
          onClick={cycleNurture}
          style={{
            marginTop: 20,
            background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
            borderRadius: 14,
            padding: "18px 24px",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
            <div style={{ fontSize: 24, lineHeight: 1 }}>{NURTURE_MESSAGES[nurtureMsgIdx].icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 3 }}>{NURTURE_MESSAGES[nurtureMsgIdx].headline}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{NURTURE_MESSAGES[nurtureMsgIdx].body}</div>
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>tap →</div>
          </div>
          {/* Dots */}
          <div style={{ display: "flex", gap: 5, marginTop: 12, justifyContent: "center" }}>
            {NURTURE_MESSAGES.map((_, i) => (
              <div key={i} style={{ width: i === nurtureMsgIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === nurtureMsgIdx ? T.secondary || "#C9A227" : "rgba(255,255,255,0.2)", transition: "all 0.3s" }} />
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PERSONALIZED RECOMMENDATIONS (Upsell Engine)
        ══════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>🎯 Recommended for You</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>Personalized based on your order & purchase history</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: T.primary, background: T.light, padding: "3px 8px", borderRadius: 8 }}>AI-Powered</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {RECOMMENDATIONS.map((rec) => (
              <div
                key={rec.id}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  border: addedItems.includes(rec.id) ? `2px solid ${T.primary}` : "2px solid transparent",
                  transition: "all 0.2s",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Match Score Arc */}
                <div style={{ position: "absolute", top: 10, right: 10, width: 38, height: 38 }}>
                  <svg width="38" height="38" viewBox="0 0 38 38">
                    <circle cx="19" cy="19" r="15" fill="none" stroke="#F3F4F6" strokeWidth="4" />
                    <circle
                      cx="19" cy="19" r="15" fill="none"
                      stroke={T.primary} strokeWidth="4"
                      strokeDasharray={`${(rec.match / 100) * 94.25} 94.25`}
                      strokeLinecap="round"
                      transform="rotate(-90 19 19)"
                    />
                    <text x="19" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill={T.primary}>{rec.match}%</text>
                  </svg>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: T.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{rec.img}</div>
                  <div style={{ flex: 1, paddingRight: 32 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{rec.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.primary, marginTop: 1 }}>${rec.price.toFixed(2)}</div>
                  </div>
                </div>

                {/* Why recommended */}
                <div style={{ fontSize: 10, color: "#6B7280", background: "#F9FAFB", borderRadius: 6, padding: "5px 8px", marginBottom: 8, lineHeight: 1.4 }}>
                  💡 {rec.reason}
                </div>

                {/* Badge + Social Proof */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, background: T.accent, color: T.primary, padding: "2px 7px", borderRadius: 8 }}>{rec.badge}</span>
                  <span style={{ fontSize: 9, color: "#9CA3AF" }}>{rec.sales}</span>
                </div>

                {/* Add Button */}
                <button
                  onClick={() => toggleAdd(rec.id)}
                  style={{
                    width: "100%",
                    padding: "7px 0",
                    borderRadius: 8,
                    border: "none",
                    background: addedItems.includes(rec.id) ? T.accent : T.gradient,
                    color: addedItems.includes(rec.id) ? T.primary : "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    letterSpacing: 0.5,
                  }}
                >
                  {addedItems.includes(rec.id) ? "✓ Added" : "+ Add to Order"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PRODUCT SUPPORT — Tutorials & Recipes
        ══════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📚 Get More From Your Products</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>Tutorials & recipes matched to your order</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TUTORIALS.map((tut) => (
              <div
                key={tut.id}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                  border: expandedTutorial === tut.id ? `1px solid ${T.accent}` : "1px solid transparent",
                }}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedTutorial(expandedTutorial === tut.id ? null : tut.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: T.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tut.thumb}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{tut.title}</span>
                      <span style={{
                        fontSize: 8.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        background: tut.type === "recipe" ? "#FEF3C7" : T.light,
                        color: tut.type === "recipe" ? "#D97706" : T.primary,
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}>{tut.type}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>For: {tut.forProduct} · ⏱ {tut.duration} read</div>
                  </div>
                  <div style={{ fontSize: 14, color: T.muted, transition: "transform 0.2s", transform: expandedTutorial === tut.id ? "rotate(90deg)" : "rotate(0deg)" }}>›</div>
                </div>

                {/* Expanded Steps */}
                {expandedTutorial === tut.id && (
                  <div style={{ borderTop: `1px solid ${T.light}`, padding: "12px 16px 14px 16px", background: T.light }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Steps</div>
                    {tut.steps.map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < tut.steps.length - 1 ? 8 : 0 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                        <span style={{ fontSize: 11.5, color: T.text, paddingTop: 2, lineHeight: 1.4 }}>{step}</span>
                      </div>
                    ))}
                    <button style={{ marginTop: 12, width: "100%", padding: "7px 0", borderRadius: 8, border: `1.5px solid ${T.primary}`, background: "transparent", color: T.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      📺 Watch Full Tutorial →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            FOOTER — Thank You + CTA
        ══════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 28, background: "#fff", borderRadius: 14, padding: "24px 28px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 18 }}>{T.logo}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginTop: 6 }}>Thank you for your order, Sarah!</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, maxWidth: 360, margin: "8px auto 0" }}>
            You're earning <strong style={{ color: T.primary }}>47 loyalty points</strong> with this purchase. {addedItems.length > 0 ? `Adding your selections will earn ${addedItems.length * 12} bonus points!` : "Add a recommended product to earn bonus points!"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.gradient, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {addedItems.length > 0 ? `Place Order (+$${addedTotal.toFixed(2)})` : "Browse Store"}
            </button>
            <button style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${T.accent}`, background: "transparent", color: T.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Share & Earn
            </button>
          </div>
        </div>

        {/* Tiny label */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 9.5, color: "#9CA3AF" }}>
          Smart Invoice Engine v2.1 · Personalized recommendations · Brand-themed delivery
        </div>
      </div>
    </div>
  );
}
