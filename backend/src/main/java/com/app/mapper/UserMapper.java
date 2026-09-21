package com.app.mapper;

import com.app.domain.User;
import org.apache.ibatis.annotations.Param;

public interface UserMapper {

    int countByLoginId(@Param("loginId") String loginId);

    int countByEmail(@Param("email") String email);

    int countByNickname(@Param("nickname") String nickname);

    User findByLoginId(@Param("loginId") String loginId);

    User findByEmail(@Param("email") String email);

    int insertUser(User user);
}
