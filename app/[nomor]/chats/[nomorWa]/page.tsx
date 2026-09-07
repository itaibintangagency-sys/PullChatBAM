function driveDirectUrl(viewUrl: string): string {
  const match = viewUrl.match(/\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/uc?export=view&id=${match[1]}` : viewUrl;
}

function mediaDisplayUrl(mediaUrl: string): string {
  return mediaUrl.includes('drive.google.com')
    ? driveDirectUrl(mediaUrl)
    : `/api/media-proxy?url=${encodeURIComponent(mediaUrl)}`;
}

function Bubble({ log }: { log: ChatLog }) {
  const isCustomer = log.sender === 'CUSTOMER';
  const time = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${isCustomer ? 'bg-white text-gray-900' : 'bg-green-600 text-white'}`}>
        {log.message_type !== 'text' && log.media_url && (
          <img src={mediaDisplayUrl(log.media_url)} alt="media" className="mb-1 max-h-64 rounded-lg" />
        )}
        {log.message_type !== 'text' && !log.media_url && (
          <p className={`text-xs italic ${isCustomer ? 'text-gray-400' : 'text-green-100'}`}>
            [{log.message_type} - tidak tersimpan]
          </p>
        )}
        {log.message_text && <p className="whitespace-pre-wrap text-sm">{log.message_text}</p>}
        <p className={`mt-1 text-right text-[11px] ${isCustomer ? 'text-gray-400' : 'text-green-100'}`}>{time}</p>
      </div>
    </div>
  );
}
