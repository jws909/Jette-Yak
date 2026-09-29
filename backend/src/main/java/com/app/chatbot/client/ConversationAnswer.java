package com.app.chatbot.client;

import java.util.List;

public record ConversationAnswer(String answer, List<String> followUpQuestions, String urgency) {}
