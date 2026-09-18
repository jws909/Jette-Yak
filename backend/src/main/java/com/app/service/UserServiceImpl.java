package com.app.service;

import com.app.domain.User;
import com.app.dto.SignupRequest;
import com.app.mapper.UserMapper;
import com.app.util.PasswordUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.regex.Pattern;

@Service
public class UserServiceImpl implements UserService {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9]{6,20}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int NICKNAME_MIN_LENGTH = 2;
    private static final int NICKNAME_MAX_LENGTH = 6;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private EmailVerificationService emailVerificationService;

    @Override
    public boolean isLoginIdAvailable(String loginId) {
        validateUsernameFormat(loginId);
        return userMapper.countByLoginId(loginId) == 0;
    }

    @Override
    public boolean isEmailAvailable(String email) {
        validateEmailFormat(email);
        return userMapper.countByEmail(email) == 0;
    }

    @Override
    public boolean isNicknameAvailable(String nickname) {
        validateNicknameFormat(nickname);
        return userMapper.countByNickname(nickname) == 0;
    }

    @Override
    public void signup(SignupRequest request) {
        validateUsernameFormat(request.getLoginId());
        validateEmailFormat(request.getEmail());
        validateNicknameFormat(request.getNickname());

        if (!isLoginIdAvailable(request.getLoginId())) {
            throw new IllegalStateException("이미 사용 중인 아이디입니다.");
        }
        if (!isEmailAvailable(request.getEmail())) {
            throw new IllegalStateException("이미 가입중인 이메일입니다.");
        }
        if (!isNicknameAvailable(request.getNickname())) {
            throw new IllegalStateException("이미 사용중인 닉네임입니다.");
        }
        if (!emailVerificationService.isVerified(request.getEmail())) {
            throw new IllegalStateException("이메일 인증이 필요합니다.");
        }

        User user = new User();
        user.setLoginId(request.getLoginId());
        user.setPasswordHash(PasswordUtil.sha256(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setNickname(request.getNickname());
        user.setSex(request.getSex());
        user.setBirthdate(LocalDate.parse(request.getBirthdate())); // "yyyy-MM-dd"
        user.setIsPregnant(request.getIsPregnant() != null ? request.getIsPregnant() : 0);
        user.setTel(request.getTel());

        userMapper.insertUser(user);

        emailVerificationService.clearVerification(request.getEmail());
    }

    private void validateUsernameFormat(String loginId) {
        if (loginId == null || !USERNAME_PATTERN.matcher(loginId).matches()) {
            throw new IllegalArgumentException("아이디는 영문, 숫자 조합 6자 이상이어야 합니다.");
        }
    }

    private void validateEmailFormat(String email) {
        if (email == null || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new IllegalArgumentException("올바른 이메일 형식이 아닙니다.");
        }
    }

    private void validateNicknameFormat(String nickname) {
        if (nickname == null || nickname.length() < NICKNAME_MIN_LENGTH || nickname.length() > NICKNAME_MAX_LENGTH) {
            throw new IllegalArgumentException("닉네임은 " + NICKNAME_MIN_LENGTH + "~" + NICKNAME_MAX_LENGTH + "자로 입력해 주세요.");
        }
    }
}
