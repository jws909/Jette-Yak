package com.app.service;

import com.app.domain.User;
import com.app.dto.SignupRequest;
import com.app.mapper.UserMapper;
import com.app.util.PasswordUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Override
    public boolean isLoginIdAvailable(String loginId) {
        return userMapper.countByLoginId(loginId) == 0;
    }

    @Override
    public boolean isEmailAvailable(String email) {
        return userMapper.countByEmail(email) == 0;
    }

    @Override
    public boolean isNicknameAvailable(String nickname) {
        return userMapper.countByNickname(nickname) == 0;
    }

    @Override
    public void signup(SignupRequest request) {
        if (!isLoginIdAvailable(request.getLoginId())) {
            throw new IllegalStateException("이미 사용 중인 아이디입니다.");
        }
        if (!isEmailAvailable(request.getEmail())) {
            throw new IllegalStateException("이미 가입중인 이메일입니다.");
        }
        if (!isNicknameAvailable(request.getNickname())) {
            throw new IllegalStateException("이미 사용중인 닉네임입니다.");
        }

        User user = new User();
        user.setLoginId(request.getLoginId());
        user.setPasswordHash(PasswordUtil.sha256(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setNickname(request.getNickname());
        user.setSex(request.getSex());
        user.setBirthdate(LocalDate.parse(request.getBirthdate())); // "yyyy-MM-dd"
        user.setTel(request.getTel());

        userMapper.insertUser(user);
    }
}
