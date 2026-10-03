export default function ProtectedLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        padding: "1rem 0",
        animation: "fadeIn 0.25s ease-out",
        maxWidth: "100%",
      }}
    >
      {/* Top Header Skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div
          style={{
            width: "240px",
            height: "28px",
            borderRadius: "6px",
            background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
            backgroundSize: "200% 100%",
            animation: "pulseSubtle 1.5s infinite ease-in-out",
          }}
        />
        <div
          style={{
            width: "380px",
            height: "16px",
            borderRadius: "4px",
            background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
            backgroundSize: "200% 100%",
            animation: "pulseSubtle 1.5s infinite ease-in-out",
          }}
        />
      </div>

      {/* KPI Cards Row Skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: "88px",
              borderRadius: "12px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                width: "60%",
                height: "14px",
                borderRadius: "4px",
                background: "#f1f5f9",
              }}
            />
            <div
              style={{
                width: "40%",
                height: "24px",
                borderRadius: "6px",
                background: "#e2e8f0",
              }}
            />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div
        style={{
          minHeight: "360px",
          borderRadius: "14px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: "180px", height: "20px", borderRadius: "4px", background: "#e2e8f0" }} />
          <div style={{ width: "120px", height: "32px", borderRadius: "6px", background: "#f1f5f9" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              style={{
                height: "44px",
                borderRadius: "8px",
                background: "#f8fafc",
                border: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                padding: "0 1rem",
                gap: "1rem",
              }}
            >
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e2e8f0" }} />
              <div style={{ width: "35%", height: "14px", borderRadius: "4px", background: "#e2e8f0" }} />
              <div style={{ width: "20%", height: "14px", borderRadius: "4px", background: "#f1f5f9", marginLeft: "auto" }} />
              <div style={{ width: "15%", height: "14px", borderRadius: "4px", background: "#e2e8f0" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
