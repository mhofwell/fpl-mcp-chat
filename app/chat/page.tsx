import ChatUI from '@/components/chat/ChatUI';

export default function ChatPage() {
    return (
        <div className="flex flex-col h-screen">
            <header className="p-4 border-b">
                <h1 className="text-2xl font-bold text-green-700">
                    FPL Chat Assistant
                </h1>
            </header>

            <ChatUI />
        </div>
    );
}
