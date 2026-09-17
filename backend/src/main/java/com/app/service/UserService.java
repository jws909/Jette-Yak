package com.app.service;

import com.app.dto.SignupRequest;

public interface UserService {

    boolean isLoginIdAvailable(String loginId);

    boolean isEmailAvailable(String email);

    boolean isNicknameAvailable(String nickname);

    void signup(SignupRequest request);
}
