package com.app.mapper;

import com.app.domain.User;
import org.apache.ibatis.annotations.Param;

public interface UserMapper {

    int countByLoginId(@Param("loginId") String loginId);

    int countByEmail(@Param("email") String email);

    int countByNickname(@Param("nickname") String nickname);

    int countByNicknameExceptLoginId(@Param("nickname") String nickname, @Param("loginId") String loginId);

    User findByLoginId(@Param("loginId") String loginId);

    User findByEmail(@Param("email") String email);

    int updatePasswordHash(@Param("loginId") String loginId, @Param("passwordHash") String passwordHash);

    int updateNickname(@Param("loginId") String loginId, @Param("nickname") String nickname);

    int updateProfileImageUrl(@Param("loginId") String loginId, @Param("profileImageUrl") String profileImageUrl);

    int insertUser(User user);
}
