class CareerBot {
    constructor() {
        this.currentScreen = 'welcome-screen';
        this.sessionId = null;
        this.profession = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = {};
        this.resumeData = null;
        this.templates = [];
        this.selectedTemplate = null;
        
        this.voiceService = new VoiceService();
        this.init();
    }

    init() {
        this.bindEvents();
        this.showScreen('welcome-screen');
    }

    bindEvents() {
        // Navigation
        document.getElementById('start-chat').addEventListener('click', () => {
            this.showScreen('profession-screen');
        });

        // Profession selection
        document.querySelectorAll('.profession-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectProfession(e));
        });

        // Voice controls
        document.getElementById('voice-input-btn').addEventListener('click', () => this.startVoiceInput());
        document.getElementById('read-question-btn').addEventListener('click', () => this.readQuestion());

        // Language change
        document.getElementById('language').addEventListener('change', (e) => {
            this.voiceService.setLanguage(e.target.value);
        });

        // Download and new resume
        document.getElementById('download-btn').addEventListener('click', () => this.downloadResume());
        document.getElementById('new-resume-btn').addEventListener('click', () => this.resetApp());
    }

    async selectProfession(event) {
        const professionCard = event.currentTarget;
        this.profession = professionCard.dataset.profession;
        
        // Add selection effect
        document.querySelectorAll('.profession-card').forEach(card => {
            card.style.borderColor = '';
        });
        professionCard.style.borderColor = 'var(--primary-color)';
        
        try {
            this.addMessage('bot', `Great! I see you're a ${this.getProfessionDisplayName(this.profession)}. Let me ask you a few questions to create your professional resume.`);
            
            const response = await this.apiCall('/start_session', {
                profession: this.profession
            });

            if (response) {
                this.sessionId = response.session_id;
                this.questions = response.questions;
                this.showScreen('chat-screen');
                setTimeout(() => this.displayQuestion(0), 1000);
            }
        } catch (error) {
            this.addMessage('bot', 'Sorry, I encountered an error. Please try again.');
            console.error('Error:', error);
        }
    }

    getProfessionDisplayName(profession) {
        const names = {
            'driver': 'Driver',
            'construction_worker': 'Construction Worker',
            'housekeeper': 'Housekeeper',
            'security_guard': 'Security Guard'
        };
        return names[profession] || profession;
    }

    addMessage(sender, text, isHTML = false) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        if (isHTML) {
            messageDiv.innerHTML = text;
        } else {
            messageDiv.textContent = text;
        }
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    displayQuestion(index) {
        if (index < 0 || index >= this.questions.length) return;

        this.currentQuestionIndex = index;
        const question = this.questions[index];
        
        // Add question to chat
        this.addMessage('bot', question.question);
        
        // Display options
        this.displayOptions(question);
        
        // Update progress
        this.updateProgress();
    }

    displayOptions(question) {
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';
        
        const optionsGrid = document.createElement('div');
        optionsGrid.className = 'options-grid';
        
        question.options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = option;
            button.addEventListener('click', () => this.selectOption(option, question));
            optionsGrid.appendChild(button);
        });
        
        optionsContainer.appendChild(optionsGrid);
    }

    selectOption(option, question) {
        const questionId = question.id;
        
        if (question.type === 'multiple') {
            if (!this.answers[questionId]) {
                this.answers[questionId] = [];
            }
            
            const index = this.answers[questionId].indexOf(option);
            if (index > -1) {
                this.answers[questionId].splice(index, 1);
            } else {
                this.answers[questionId].push(option);
            }
        } else {
            this.answers[questionId] = option;
        }
        
        // Add user's selection to chat
        const displayText = question.type === 'multiple' ? 
            this.answers[questionId].join(', ') : option;
        this.addMessage('user', displayText);
        
        this.updateOptionButtons(question);
        
        // Auto-proceed after selection
        setTimeout(() => this.nextQuestion(), 1000);
    }

    updateOptionButtons(question) {
        const buttons = document.querySelectorAll('.option-btn');
        const questionId = question.id;
        const selectedAnswers = this.answers[questionId];
        
        buttons.forEach(button => {
            const optionText = button.textContent;
            
            if (question.type === 'multiple') {
                if (selectedAnswers && selectedAnswers.includes(optionText)) {
                    button.classList.add('selected');
                } else {
                    button.classList.remove('selected');
                }
            } else {
                if (selectedAnswers === optionText) {
                    button.classList.add('selected');
                } else {
                    button.classList.remove('selected');
                }
            }
        });
    }

    async nextQuestion() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const questionId = currentQuestion.id;
        
        if (!this.answers[questionId] || 
            (Array.isArray(this.answers[questionId]) && this.answers[questionId].length === 0)) {
            return;
        }

        if (this.currentQuestionIndex < this.questions.length - 1) {
            setTimeout(() => this.displayQuestion(this.currentQuestionIndex + 1), 500);
        } else {
            this.addMessage('bot', "Thank you! I'm now generating your professional resume...");
            await this.generateResume();
        }
    }

    async generateResume() {
        try {
            const response = await this.apiCall('/submit_answers', {
                session_id: this.sessionId,
                answers: this.answers
            });

            if (response) {
                this.resumeData = response.resume_data;
                this.templates = response.templates;
                this.showTemplates();
            }
        } catch (error) {
            this.addMessage('bot', 'Sorry, there was an error generating your resume. Please try again.');
            console.error('Error:', error);
        }
    }

    showTemplates() {
        const container = document.getElementById('templates-container');
        container.innerHTML = '';
        
        this.templates.forEach((template, index) => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-preview">${template.name}</div>
                <div class="template-name">${template.name}</div>
                <div class="template-description">${template.description}</div>
            `;
            
            card.addEventListener('click', () => this.selectTemplate(template, index));
            container.appendChild(card);
        });
        
        this.showScreen('templates-screen');
    }

    selectTemplate(template, index) {
        this.selectedTemplate = template;
        
        // Remove selected class from all cards
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add selected class to clicked card
        document.querySelectorAll('.template-card')[index].classList.add('selected');
        
        // Show preview and proceed to download screen
        document.getElementById('resume-preview').innerHTML = template.html;
        this.showScreen('download-screen');
    }

    async downloadResume() {
        if (!this.selectedTemplate) return;

        try {
            const response = await fetch('http://localhost:5000/api/download_resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    template_html: this.selectedTemplate.html,
                    filename: `resume_${this.profession}.html`
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `resume_${this.profession}.html`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Error downloading resume:', error);
        }
    }

    readQuestion() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        if (currentQuestion) {
            const questionText = currentQuestion.question;
            const optionsText = currentQuestion.options.join(', ');
            const fullText = `${questionText}. Options: ${optionsText}`;
            this.voiceService.speak(fullText);
        }
    }

    async startVoiceInput() {
        const modal = document.getElementById('voice-modal');
        modal.classList.add('active');

        try {
            const result = await this.voiceService.recognizeSpeech();
            modal.classList.remove('active');
            
            if (result) {
                this.addMessage('user', result);
                this.matchVoiceWithOptions(result);
            }
        } catch (error) {
            modal.classList.remove('active');
            console.error('Voice recognition error:', error);
        }
    }

    matchVoiceWithOptions(voiceText) {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const options = currentQuestion.options;
        
        const voiceLower = voiceText.toLowerCase();
        
        for (const option of options) {
            if (voiceLower.includes(option.toLowerCase()) || 
                this.calculateSimilarity(voiceLower, option.toLowerCase()) > 0.6) {
                this.selectOption(option, currentQuestion);
                break;
            }
        }
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        return (longer.length - this.editDistance(longer, shorter)) / parseFloat(longer.length);
    }

    editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    updateProgress() {
        const progress = ((this.currentQuestionIndex + 1) / this.questions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = 
            `Question ${this.currentQuestionIndex + 1} of ${this.questions.length}`;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');
        this.currentScreen = screenName;
    }

    async apiCall(endpoint, data) {
        try {
            const response = await fetch(`http://localhost:5000/api${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            this.addMessage('bot', 'Sorry, I am having trouble connecting to the server. Please make sure the backend is running.');
            return null;
        }
    }

    resetApp() {
        this.currentScreen = 'welcome-screen';
        this.sessionId = null;
        this.profession = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = {};
        this.resumeData = null;
        this.templates = [];
        this.selectedTemplate = null;
        
        // Clear chat messages
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('options-container').innerHTML = '';
        
        this.showScreen('welcome-screen');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new CareerBot();
});