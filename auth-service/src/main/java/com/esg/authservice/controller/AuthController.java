package com.esg.authservice.controller;

import com.esg.authservice.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private JwtUtil jwtUtil;

    @GetMapping("/login-test")
    public String login(@RequestParam String userId) {
        String token = jwtUtil.createToken(userId, "USER");
        return "Bearer " + token;
    }
}