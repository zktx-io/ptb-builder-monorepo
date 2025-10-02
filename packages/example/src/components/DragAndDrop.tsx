import React, { useCallback, useRef, useState } from 'react';
import type { PTBDoc } from '@zktx.io/ptb-builder';
import { PRIMARY_BUTTON, SECONDARY_BUTTONS, TEMPLATE_MAP } from '../templates';

export function DragAndDrop({
  onDrop,
  onChancel,
}: {
  onDrop: (data: PTBDoc) => void;
  onChancel: () => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [message, setMessage] = useState('Drop File (*.ptb) here');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const parseAndLoad = (text: string) => {
    try {
      const json = JSON.parse(text);
      onDrop(json);
      setIsVisible(false);
    } catch {
      setMessage('Invalid JSON file.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.ptb')) {
      setMessage('Invalid file. Please upload a .ptb file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => parseAndLoad(String(ev.target?.result ?? ''));
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.ptb')) {
      setMessage('Invalid file. Please upload a .ptb file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => parseAndLoad(String(ev.target?.result ?? ''));
    reader.readAsText(f);
    e.target.value = '';
  };

  const handlePickTemplate = (key: string) => {
    if (key === 'new') {
      onChancel();
      setIsVisible(false);
      return;
    }
    const tpl = (
      TEMPLATE_MAP as Record<string, { file: () => string } | undefined>
    )[key];
    if (!tpl) return;
    try {
      const doc = JSON.parse(tpl.file());
      onDrop(doc as PTBDoc);
      setIsVisible(false);
    } catch {
      setMessage('Failed to load template.');
    }
  };

  if (!isVisible) return null;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(1, 24, 41, 0.2)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        textAlign: 'center',
        padding: 24,
        gap: 20,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        style={{
          width: 'min(720px, 90vw)',
          minHeight: 200,
          border: `2px dashed ${dragging ? '#7fd1ff' : 'rgba(255,255,255,0.6)'}`,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: dragging
            ? 'rgba(255, 255, 255, 0.12)'
            : 'rgba(255, 255, 255, 0.06)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          transition: 'border-color 0.2s ease, background 0.2s ease',
          backdropFilter: 'blur(4px)',
        }}
      >
        <p style={{ fontSize: 20, margin: 0 }}>
          {dragging ? 'Drop to upload' : message}
        </p>
        <p style={{ fontSize: 14, opacity: 0.75, marginTop: 8 }}>
          Drag & Drop your <code>.ptb</code> file here or click to choose
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".ptb,application/json"
          hidden
          onChange={handleFileChange}
        />
      </div>

      <div
        style={{
          width: 'min(720px, 90vw)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          title={PRIMARY_BUTTON.tooltip}
          onClick={() => handlePickTemplate(PRIMARY_BUTTON.key)}
          style={{
            padding: '12px 20px',
            fontSize: 16,
            fontWeight: 700,
            color: '#011829',
            backgroundColor: '#ffffff',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            minWidth: 200,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          }}
        >
          {PRIMARY_BUTTON.label}
        </button>
      </div>

      <div
        style={{
          width: 'min(720px, 90vw)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: 0.6,
          fontSize: 12,
        }}
      >
        <div
          style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.3)' }}
        />
        <span>or pick a template</span>
        <div
          style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.3)' }}
        />
      </div>

      <div
        style={{
          width: 'min(720px, 90vw)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          justifyContent: 'center',
        }}
      >
        {SECONDARY_BUTTONS.map(({ key, label, tooltip }) => (
          <button
            key={key}
            title={tooltip}
            onClick={() => handlePickTemplate(key)}
            style={{
              padding: '10px 14px',
              fontSize: 14,
              color: '#011829',
              backgroundColor: '#ffffff',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              minWidth: 160,
              boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
