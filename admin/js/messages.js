// Messages Management JavaScript

let conversations = [];
let currentConversation = null;
let messages = [];

// Load conversations
async function loadConversations() {
    try {
        const response = await fetch('/api/admin/messages/conversations', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            conversations = await response.json();
            displayConversations();
            updateUnreadCount();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        // Show sample data for demonstration
        displaySampleConversations();
    }
}

// Display conversations
function displayConversations() {
    const conversationsList = document.getElementById('conversationsList');
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = '<p style="text-align: center; padding: 40px; color: #9ca3af;">No messages yet</p>';
        return;
    }
    
    conversationsList.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${currentConversation && currentConversation.id === conv.id ? 'active' : ''}" 
             onclick="selectConversation(${conv.id})">
            <div class="conversation-avatar">${conv.userName.charAt(0).toUpperCase()}</div>
            <div class="conversation-details">
                <div class="conversation-header">
                    <span class="conversation-name">${conv.userName}</span>
                    <span class="conversation-time">${formatTime(conv.lastMessageTime)}</span>
                </div>
                <div class="conversation-preview">${conv.lastMessage}</div>
            </div>
            ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : ''}
        </div>
    `).join('');
}

// Display sample conversations for demonstration
function displaySampleConversations() {
    const conversationsList = document.getElementById('conversationsList');
    conversationsList.innerHTML = `
        <div class="conversation-item" onclick="selectSampleConversation(1)">
            <div class="conversation-avatar">J</div>
            <div class="conversation-details">
                <div class="conversation-header">
                    <span class="conversation-name">John Doe</span>
                    <span class="conversation-time">2m ago</span>
                </div>
                <div class="conversation-preview">Hello, I need help with my deposit...</div>
            </div>
            <span class="unread-badge">2</span>
        </div>
        <div class="conversation-item" onclick="selectSampleConversation(2)">
            <div class="conversation-avatar">S</div>
            <div class="conversation-details">
                <div class="conversation-header">
                    <span class="conversation-name">Sarah Smith</span>
                    <span class="conversation-time">1h ago</span>
                </div>
                <div class="conversation-preview">When will my withdrawal be processed?</div>
            </div>
        </div>
        <div class="conversation-item" onclick="selectSampleConversation(3)">
            <div class="conversation-avatar">M</div>
            <div class="conversation-details">
                <div class="conversation-header">
                    <span class="conversation-name">Mike Johnson</span>
                    <span class="conversation-time">3h ago</span>
                </div>
                <div class="conversation-preview">Thank you for your help!</div>
            </div>
        </div>
    `;
}

// Select conversation
async function selectConversation(conversationId) {
    currentConversation = conversations.find(c => c.id === conversationId);
    if (!currentConversation) return;
    
    // Update UI
    displayConversations();
    
    // Load messages
    await loadMessages(conversationId);
    
    // Show chat panel
    showChatPanel();
}

// Select sample conversation (for demo)
function selectSampleConversation(id) {
    const sampleUsers = {
        1: { name: 'John Doe', avatar: 'J' },
        2: { name: 'Sarah Smith', avatar: 'S' },
        3: { name: 'Mike Johnson', avatar: 'M' }
    };
    
    const user = sampleUsers[id];
    document.getElementById('chatUserName').textContent = user.name;
    document.getElementById('chatAvatar').textContent = user.avatar;
    
    // Load sample messages
    loadSampleMessages(id);
    
    // Show chat panel
    showChatPanel();
}

// Load messages
async function loadMessages(conversationId) {
    try {
        const response = await fetch(`/api/admin/messages/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            messages = await response.json();
            displayMessages();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Load sample messages (for demo)
function loadSampleMessages(userId) {
    const sampleMessages = {
        1: [
            { sender: 'user', text: 'Hello, I need help with my deposit', time: '10:30 AM', avatar: 'J' },
            { sender: 'admin', text: 'Hello! I\'d be happy to help. Can you provide your transaction ID?', time: '10:31 AM', avatar: 'A' },
            { sender: 'user', text: 'Sure, it\'s TXN123456789', time: '10:32 AM', avatar: 'J' },
            { sender: 'admin', text: 'Thank you. Let me check on that for you.', time: '10:33 AM', avatar: 'A' }
        ],
        2: [
            { sender: 'user', text: 'When will my withdrawal be processed?', time: '9:15 AM', avatar: 'S' },
            { sender: 'admin', text: 'Withdrawals are typically processed within 24 hours. When did you submit your request?', time: '9:20 AM', avatar: 'A' },
            { sender: 'user', text: 'Yesterday evening', time: '9:22 AM', avatar: 'S' }
        ],
        3: [
            { sender: 'user', text: 'I have a question about the referral program', time: '8:00 AM', avatar: 'M' },
            { sender: 'admin', text: 'Of course! What would you like to know?', time: '8:05 AM', avatar: 'A' },
            { sender: 'user', text: 'How much is the referral bonus?', time: '8:06 AM', avatar: 'M' },
            { sender: 'admin', text: 'You earn 5% commission on your referrals\' deposits.', time: '8:07 AM', avatar: 'A' },
            { sender: 'user', text: 'Thank you for your help!', time: '8:10 AM', avatar: 'M' }
        ]
    };
    
    const msgs = sampleMessages[userId] || [];
    displaySampleMessages(msgs);
}

// Display messages
function displayMessages() {
    const messagesArea = document.getElementById('messagesArea');
    
    if (messages.length === 0) {
        messagesArea.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 40px;">No messages yet</p>';
        return;
    }
    
    messagesArea.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender === 'admin' ? 'sent' : ''}">
            <div class="message-avatar">${msg.avatar || 'U'}</div>
            <div class="message-content">
                <div class="message-bubble">${msg.text}</div>
                <div class="message-time">${msg.time}</div>
            </div>
        </div>
    `).join('');
    
    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Display sample messages
function displaySampleMessages(msgs) {
    const messagesArea = document.getElementById('messagesArea');
    
    messagesArea.innerHTML = msgs.map(msg => `
        <div class="message ${msg.sender === 'admin' ? 'sent' : ''}">
            <div class="message-avatar">${msg.avatar}</div>
            <div class="message-content">
                <div class="message-bubble">${msg.text}</div>
                <div class="message-time">${msg.time}</div>
            </div>
        </div>
    `).join('');
    
    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Show chat panel
function showChatPanel() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('chatContent').style.display = 'flex';
}

// Send message
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text) return;
    
    try {
        // Add message to UI immediately
        const messagesArea = document.getElementById('messagesArea');
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const messageHTML = `
            <div class="message sent">
                <div class="message-avatar">A</div>
                <div class="message-content">
                    <div class="message-bubble">${text}</div>
                    <div class="message-time">${timeStr}</div>
                </div>
            </div>
        `;
        
        messagesArea.insertAdjacentHTML('beforeend', messageHTML);
        messagesArea.scrollTop = messagesArea.scrollHeight;
        
        // Clear input
        messageInput.value = '';
        
        // Send to server
        if (currentConversation) {
            await fetch(`/api/admin/messages/${currentConversation.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({ message: text })
            });
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Handle Enter key press
function handleMessageKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Search conversations
document.getElementById('searchConversations').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    
    document.querySelectorAll('.conversation-item').forEach(item => {
        const name = item.querySelector('.conversation-name').textContent.toLowerCase();
        const preview = item.querySelector('.conversation-preview').textContent.toLowerCase();
        
        if (name.includes(query) || preview.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Compose new message
function composeNewMessage() {
    alert('New message feature coming soon!');
}

// View user profile
function viewUserProfile() {
    if (currentConversation) {
        window.open(`users.html?id=${currentConversation.userId}`, '_blank');
    }
}

// Archive conversation
async function archiveConversation() {
    if (!currentConversation) return;
    
    if (confirm('Archive this conversation?')) {
        try {
            await fetch(`/api/admin/messages/${currentConversation.id}/archive`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                }
            });
            
            alert('Conversation archived');
            loadConversations();
        } catch (error) {
            console.error('Error archiving conversation:', error);
        }
    }
}

// Update unread count
function updateUnreadCount() {
    const unreadCount = conversations.reduce((sum, conv) => sum + (conv.unread || 0), 0);
    const badge = document.getElementById('unreadMessages');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

// Format time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadConversations();

    // Real-time auto-refresh via the shared poller.
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(loadConversations);
    } else {
        // Fallback if the shared helper isn't present.
        setInterval(loadConversations, 10000);
    }
});
