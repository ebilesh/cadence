import React from "react";
export default function BuildCredit() {
  return (
    <div className="build-credit" aria-label="App version">
      <small>
        v{__APP_BUILD__.version} · {__APP_BUILD__.revision}
      </small>
    </div>
  );
}

