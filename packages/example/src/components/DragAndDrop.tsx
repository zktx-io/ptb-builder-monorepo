import React, { useState } from 'react';

export const DragAndDrop = ({ onDrop }: { onDrop: (data: object) => void }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [message, setMessage] = useState('Drop File (*.ptb)');

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];

    if (file) {
      if (file.name.endsWith('.ptb')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target?.result as string);
            onDrop(json);
            setIsVisible(false);
          } catch (error) {
            setMessage('Invalid JSON file.');
          }
        };
        reader.readAsText(file);
      } else {
        setMessage('Invalid file. Please upload a .ptb file.');
      }
    }
  };

  const handleCancel = () => {
    setIsVisible(false);
  };

  return (
    <>
      {isVisible && (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999, // 최상위 레이어
            fontSize: '24px',
            textAlign: 'center',
            userSelect: 'none', // 텍스트 선택 방지
            transition: 'opacity 0.3s ease',
          }}
        >
          <p>{message}</p>
          <button
            onClick={handleCancel}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              fontSize: '16px',
              color: 'white',
              backgroundColor: 'transparent',
              border: '2px solid white',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.3s',
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor =
                'rgba(255, 255, 255, 0.2)')
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
};
