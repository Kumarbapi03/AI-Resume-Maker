class ResumeBuilder {
    constructor() {
        this.currentStep = 1;
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
        this.showStep(1);
    }

    bindEvents() {
        // Profession selection
        document.querySelectorAll('.profession-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectProfession(e));
        });

        // Navigation buttons
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('prev-btn').addEventListener('click', () => this.previousQuestion());
        document.getElementById('back-to-questions').addEventListener('click', () => this.showStep(2));
        document.getElementById('download-btn').addEventListener('click', () => this.downloadResume());
        document.getElementById('create-new').addEventListener('click', () => this.resetApp());

        // Voice controls
        document.getElementById('speak-question').addEventListener('click', () => this.speakQuestion());
        document.getElementById('start-voice-input').addEventListener('click', () => this.startVoiceInput());

        // Language change
        document.getElementById('language').addEventListener('change', (e) => {
            this.voiceService.setLanguage(e.target.value);
        });
    }

    async selectProfession(event) {
        this.profession = event.currentTarget.dataset.profession;
        
        try {
            const response = await fetch('http://localhost:5000/api/start_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    profession: this.profession
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.sessionId = data.session_id;
                this.questions = data.questions;
                this.showStep(2);
                this.displayQuestion(0);
            } else {
                alert('Error starting session: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to connect to server. Please make sure the backend is running.');
        }
    }

    displayQuestion(index) {
        if (index < 0 || index >= this.questions.length) return;

        this.currentQuestionIndex = index;
        const question = this.questions[index];
        
        document.getElementById('question-text').textContent = question.question;
        
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';
        
        question.options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = option;
            button.addEventListener('click', () => this.selectOption(option, question));
            optionsContainer.appendChild(button);
        });

        // Update progress
        this.updateProgress();
        
        // Update navigation buttons
        document.getElementById('prev-btn').style.display = index === 0 ? 'none' : 'block';
        document.getElementById('next-btn').textContent = 
            index === this.questions.length - 1 ? 'Generate Resume' : 'Next';
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
        
        this.updateOptionButtons(question);
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
            alert('Please select an answer before proceeding.');
            return;
        }

        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.displayQuestion(this.currentQuestionIndex + 1);
        } else {
            await this.generateResume();
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.displayQuestion(this.currentQuestionIndex - 1);
        }
    }

    async generateResume() {
        try {
            const response = await fetch('http://localhost:5000/api/submit_answers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    answers: this.answers
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.resumeData = data.resume_data;
                this.templates = data.templates;
                this.showTemplates();
            } else {
                alert('Error generating resume: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate resume. Please try again.');
        }
    }

    showTemplates() {
        const container = document.getElementById('templates-container');
        container.innerHTML = '';
        
        this.templates.forEach((template, index) => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-preview">${template.name} Template Preview</div>
                <div class="template-name">${template.name}</div>
                <div class="template-description">${template.description}</div>
            `;
            
            card.addEventListener('click', () => this.selectTemplate(template, index));
            container.appendChild(card);
        });
        
        this.showStep(3);
    }

    selectTemplate(template, index) {
        this.selectedTemplate = template;
        
        // Remove selected class from all cards
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add selected class to clicked card
        document.querySelectorAll('.template-card')[index].classList.add('selected');
        
        // Show preview
        document.getElementById('resume-preview').innerHTML = template.html;
        this.showStep(4);
    }

    async downloadResume() {
        if (!this.selectedTemplate) {
            alert('Please select a template first.');
            return;
        }

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
            } else {
                alert('Error downloading resume');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to download resume.');
        }
    }

    speakQuestion() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const questionText = currentQuestion.question;
        const optionsText = currentQuestion.options.join(', ');
        const fullText = `${questionText}. Options: ${optionsText}`;
        
        this.voiceService.speak(fullText);
    }

    async startVoiceInput() {
        const statusElement = document.getElementById('voice-status');
        statusElement.textContent = 'Listening...';
        
        try {
            const result = await this.voiceService.recognizeSpeech();
            statusElement.textContent = `You said: ${result}`;
            
            // Match voice input with options
            this.matchVoiceWithOptions(result);
        } catch (error) {
            statusElement.textContent = 'Error: ' + error.message;
        }
    }

    matchVoiceWithOptions(voiceText) {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const options = currentQuestion.options;
        
        // Simple matching - you can improve this with more sophisticated algorithms
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
        // Simple similarity calculation - can be improved
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        return (longer.length - this.editDistance(longer, shorter)) / parseFloat(longer.length);
    }

    editDistance(s1, s2) {
        // Levenshtein distance implementation
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

    showStep(stepNumber) {
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        
        document.getElementById(`step${stepNumber}`).classList.add('active');
        this.currentStep = stepNumber;
    }

    resetApp() {
        this.currentStep = 1;
        this.sessionId = null;
        this.profession = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = {};
        this.resumeData = null;
        this.templates = [];
        this.selectedTemplate = null;
        
        this.showStep(1);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResumeBuilder();
});